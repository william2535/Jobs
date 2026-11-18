package com.willflood.jobs;

import android.content.ContentResolver;
import android.net.Uri;
import android.os.StatFs;
import android.util.Base64;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/** Disk-backed, bounded export staging. All methods run on the activity's single I/O executor. */
final class ExportStore {
    static final int MAX_CHUNK_BYTES = 192 * 1024;
    static final long MAX_FILE_BYTES = 512L * 1024 * 1024;
    private static final long FREE_SPACE_MARGIN = 8L * 1024 * 1024;
    private final File directory;
    private final File recoveryDirectory;
    private final File recoveryMetadata;
    private final Map<String, Session> sessions = new HashMap<>();

    static final class ExportException extends Exception {
        ExportException(String message) { super(message); }
    }

    static final class Session {
        final String token;
        final String name;
        final String mime;
        final long expectedBytes;
        File file;
        FileOutputStream output;
        long written;
        boolean prepared;

        Session(String token, String name, String mime, long expectedBytes, File file,
                FileOutputStream output) {
            this.token = token;
            this.name = name;
            this.mime = mime;
            this.expectedBytes = expectedBytes;
            this.file = file;
            this.output = output;
        }
    }

    static final class Recovery {
        final Session session;
        final boolean interruptedChunks;
        final boolean recoveredWithoutName;
        Recovery(Session session, boolean interruptedChunks, boolean recoveredWithoutName) {
            this.session = session;
            this.interruptedChunks = interruptedChunks;
            this.recoveredWithoutName = recoveredWithoutName;
        }
    }

    ExportStore(File cacheDirectory, File filesDirectory) {
        directory = new File(cacheDirectory, "jobs-exports");
        recoveryDirectory = new File(filesDirectory, "pending-exports");
        recoveryMetadata = new File(recoveryDirectory, "pending.json");
    }

    Recovery restore() {
        boolean interrupted = false;
        File[] chunks = directory.listFiles();
        if (chunks != null) {
            for (File file : chunks) {
                if (file.isFile() && file.getName().startsWith("jobs-export-")) {
                    interrupted = true;
                    file.delete();
                }
            }
        }
        Session restored = readRecoveryMetadata();
        boolean unnamed = false;
        if (restored == null) {
            File[] prepared = recoveryDirectory.listFiles();
            if (prepared != null) {
                for (File file : prepared) {
                    if (file.isFile() && file.getName().matches("pending-[0-9a-f-]{36}\\.bin")
                            && file.length() <= MAX_FILE_BYTES) {
                        String token = file.getName().substring(8, 44);
                        restored = new Session(token, "jobs-recovered-export.bin", "application/octet-stream",
                                file.length(), file, null);
                        restored.written = file.length();
                        restored.prepared = true;
                        unnamed = true;
                        break;
                    }
                }
            }
            if (restored == null && recoveryMetadata.exists()) interrupted = true;
        }
        if (restored != null) sessions.put(restored.token, restored);
        return new Recovery(restored, interrupted, unnamed);
    }

    Session start(String name, String mime, long expectedBytes) throws ExportException {
        if (!sessions.isEmpty()) throw new ExportException("Another file is already being exported. Finish or cancel it first.");
        if (expectedBytes < 0 || expectedBytes > MAX_FILE_BYTES) {
            throw new ExportException("This export exceeds the 512 MiB Android file limit.");
        }
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new ExportException("Jobs could not prepare temporary storage for this export.");
        }
        requireFreeSpace(expectedBytes + FREE_SPACE_MARGIN);
        String cleanName = safeName(name);
        String cleanMime = safeMime(mime);
        File temporaryFile = null;
        try {
            temporaryFile = File.createTempFile("jobs-export-", ".tmp", directory);
            String token = UUID.randomUUID().toString();
            Session session = new Session(token, cleanName, cleanMime, expectedBytes,
                    temporaryFile, new FileOutputStream(temporaryFile));
            sessions.put(token, session);
            return session;
        } catch (IOException error) {
            if (temporaryFile != null) temporaryFile.delete();
            throw new ExportException("Jobs could not create a temporary export file. Check available device storage.");
        }
    }

    long append(String token, String encoded) throws ExportException {
        Session session = require(token);
        if (session.prepared || session.output == null) throw new ExportException("This export is already waiting to be saved.");
        int maxEncoded = ((MAX_CHUNK_BYTES + 2) / 3) * 4;
        if (encoded == null || encoded.length() > maxEncoded || encoded.length() % 4 != 0
                || !encoded.matches("[A-Za-z0-9+/]*={0,2}")) {
            throw new ExportException("Jobs received an invalid export chunk.");
        }
        final byte[] decoded;
        try {
            decoded = Base64.decode(encoded, Base64.NO_WRAP);
        } catch (IllegalArgumentException error) {
            throw new ExportException("Jobs received an invalid export chunk.");
        }
        if (decoded.length > MAX_CHUNK_BYTES || session.written + decoded.length > session.expectedBytes) {
            throw new ExportException("The export byte count does not match its declared size.");
        }
        requireFreeSpace(decoded.length + FREE_SPACE_MARGIN);
        try {
            session.output.write(decoded);
            session.written += decoded.length;
            return session.written;
        } catch (IOException error) {
            discard(token);
            throw new ExportException("The export could not be written. Check available device storage and try again.");
        }
    }

    Session prepare(String token) throws ExportException {
        Session session = require(token);
        if (session.prepared) throw new ExportException("This export is already waiting to be saved.");
        if (session.written != session.expectedBytes) {
            throw new ExportException("The export is incomplete. Please start it again.");
        }
        try {
            session.output.getFD().sync();
            session.output.close();
            session.output = null;
            if (!recoveryDirectory.isDirectory() && !recoveryDirectory.mkdirs()) {
                throw new IOException("Cannot create private export recovery directory");
            }
            File durableFile = new File(recoveryDirectory, "pending-" + session.token + ".bin");
            if (!session.file.renameTo(durableFile)) throw new IOException("Cannot preserve prepared export");
            session.file = durableFile;
            session.prepared = true;
            writeRecoveryMetadata(session);
            return session;
        } catch (IOException error) {
            // Keep a completed payload if metadata persistence was interrupted; restore() can recover it.
            if (!session.prepared) discard(token);
            throw new ExportException("Jobs could not finish preparing this export. Please try again.");
        }
    }

    void copyTo(Session session, ContentResolver resolver, Uri destination) throws ExportException {
        if (!sessions.containsKey(session.token) || !session.prepared
                || session.file.length() != session.expectedBytes) {
            throw new ExportException("The temporary export is no longer available. Please start it again.");
        }
        try (FileInputStream source = new FileInputStream(session.file);
             OutputStream output = resolver.openOutputStream(destination, "w")) {
            if (output == null) throw new IOException("No output stream");
            byte[] buffer = new byte[128 * 1024];
            long copied = 0;
            int length;
            while ((length = source.read(buffer)) != -1) {
                output.write(buffer, 0, length);
                copied += length;
            }
            output.flush();
            if (copied != session.expectedBytes) throw new IOException("Incomplete copy");
        } catch (IOException | SecurityException error) {
            throw new ExportException("The file could not be saved. Check storage and choose a writable location, then try again.");
        }
        // Delete recovery data only after both streams closed successfully.
        discard(session.token);
    }

    Session preparedSession() {
        for (Session session : sessions.values()) if (session.prepared) return session;
        return null;
    }

    void discard(String token) {
        Session session = sessions.remove(token);
        if (session == null) return;
        if (session.output != null) {
            try { session.output.close(); } catch (IOException ignored) { }
            session.output = null;
        }
        session.file.delete();
        if (session.prepared) {
            recoveryMetadata.delete();
            new File(recoveryDirectory, "pending.json.tmp").delete();
        }
    }

    void close() {
        // Activity destruction is not export cancellation. Keep prepared files and metadata for
        // the document-picker result or a later recovery prompt. Incomplete chunks are noticed
        // and removed by restore(), with an explicit user-facing interruption notice.
        for (Session session : sessions.values()) {
            if (session.output != null) {
                try { session.output.close(); } catch (IOException ignored) { }
                session.output = null;
            }
        }
    }

    private void writeRecoveryMetadata(Session session) throws IOException {
        JSONObject metadata = new JSONObject();
        try {
            metadata.put("token", session.token);
            metadata.put("name", session.name);
            metadata.put("mime", session.mime);
            metadata.put("bytes", session.expectedBytes);
        } catch (JSONException error) { throw new IOException("Invalid recovery metadata", error); }
        File temporary = new File(recoveryDirectory, "pending.json.tmp");
        try (FileOutputStream stream = new FileOutputStream(temporary)) {
            stream.write(metadata.toString().getBytes(StandardCharsets.UTF_8));
            stream.getFD().sync();
        }
        if (!temporary.renameTo(recoveryMetadata)) throw new IOException("Cannot persist export recovery metadata");
    }

    private Session readRecoveryMetadata() {
        if (!recoveryMetadata.isFile() || recoveryMetadata.length() > 16 * 1024) return null;
        try (FileInputStream input = new FileInputStream(recoveryMetadata);
             ByteArrayOutputStream bytes = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[2048];
            int count;
            while ((count = input.read(buffer)) != -1) bytes.write(buffer, 0, count);
            JSONObject metadata = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            String token = metadata.getString("token");
            if (!token.matches("[0-9a-f-]{36}")) return null;
            File file = new File(recoveryDirectory, "pending-" + token + ".bin");
            long expected = metadata.getLong("bytes");
            if (expected < 0 || expected > MAX_FILE_BYTES || !file.isFile() || file.length() != expected) return null;
            Session session = new Session(token, safeName(metadata.getString("name")),
                    safeMime(metadata.getString("mime")), expected, file, null);
            session.written = expected;
            session.prepared = true;
            return session;
        } catch (IOException | JSONException error) { return null; }
    }

    private Session require(String token) throws ExportException {
        Session session = sessions.get(token);
        if (session == null) throw new ExportException("This export session has expired. Please start it again.");
        return session;
    }

    private void requireFreeSpace(long required) throws ExportException {
        try {
            if (new StatFs(directory.getAbsolutePath()).getAvailableBytes() < required) {
                throw new ExportException("There is not enough free device storage for this export.");
            }
        } catch (IllegalArgumentException error) {
            throw new ExportException("Jobs could not check available storage. Please try again.");
        }
    }

    private static String safeName(String requested) {
        String name = requested == null ? "" : requested.replaceAll("[\\x00-\\x1f\\x7f/\\\\]", "_").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) return "jobs-export.json";
        if (name.length() > 180) {
            int extensionAt = name.lastIndexOf('.');
            String extension = extensionAt > 0 && name.length() - extensionAt <= 12 ? name.substring(extensionAt) : "";
            name = name.substring(0, 180 - extension.length()) + extension;
        }
        return name;
    }

    private static String safeMime(String requested) {
        if (requested != null && requested.length() <= 100
                && requested.matches("[A-Za-z0-9!#$&^_.+-]+/[A-Za-z0-9!#$&^_.+-]+")) return requested;
        return "application/octet-stream";
    }
}
