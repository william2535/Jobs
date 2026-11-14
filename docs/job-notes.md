# Job notes

Opening a job starts in **Notes**. Enter a title if useful, write the work record, add pictures and press **Save**. A blank title is allowed; the card displays **Untitled job**. A new job can be saved without choosing a site. The settings gear holds optional job details and site association. **Plan** retains the included drawing, and **Finalisation** provides the report and export actions.

The compact toolbar provides bold, italic, underline, bullets and pictures. **More** adds headings, quotes, text sizes, text colour, highlighting, strikethrough, numbered lists, alignment, clear formatting, undo and redo. Formatting changes text presentation only; they never change device results or imply a passed test.

Pictures can be selected from files or pasted from the clipboard. Each has its own caption and remove control. Pictures are stored as actual included raster data, so they remain available without an online image URL. Supported formats are PNG, JPEG, GIF, WebP, BMP and AVIF, subject to browser decoding support. HEIC and SVG are not accepted. The limits are 24 pictures, 8 MiB per picture and 40 MiB of decoded image data in one notes document.

## Saving and documents

Notes use explicit saving. Unsaved changes are shown, and navigation uses the host application's draft protection. The editor locks during saving and picture reads; a failed save leaves the entered text, formatting and pictures available for retry. Native text undo/redo applies to the current editing session and is not a persistent revision history across saves or reloads.

After the application has been prepared for offline use, saved notes, included pictures, editing, saving and job export work locally. Notes travel in the self-contained job package, including version-3 packages for jobs without a site. Import validates them before changing saved records and retains the existing duplicate/conflict protection. The printable report includes saved formatted notes and captions. Generating a report does not issue a compliance certificate.

Older jobs without a notes document display their existing recorded description, visit notes and technician note as an editable starting point. Saving creates the structured document; no missing observation or photograph is invented.

## Structured data

`job.notesDocument` is an optional version-1 document:

```json
{
  "version": 1,
  "blocks": [
    {
      "id": "stable-block-id",
      "type": "paragraph",
      "align": "left",
      "runs": [{ "text": "Actual observation", "bold": true }]
    }
  ],
  "photos": [
    {
      "id": "stable-photo-id",
      "image": "data:image/png;base64,<included image bytes>",
      "caption": "Recorded location"
    }
  ]
}
```

The example is structural; image data must be valid included raster content. Block types are `paragraph`, `heading1`, `heading2`, `heading3`, `blockquote`, `bulletList` and `orderedList`. Lists contain `items: [{id, runs}]` instead of block-level `runs`. Alignment is `left`, `center`, `right` or `justify`. Text runs may contain `bold`, `italic`, `underline`, `strike`, `size`, `color` and `highlight`. Supported sizes are 12, 14, 16, 18, 24 and 32 pixels; colours use six-digit hexadecimal values.

Block, list-item and photo IDs must be unique within the document. Validation rejects unknown versions, unsupported fields or formatting, broken structures, external image URLs, SVG and raster declarations that do not match the image signature. Documents are bounded to 1,000 blocks, 2,000 list items, 10,000 text runs and 250,000 text characters; captions are limited to 2,000 characters. The validator returns a detached normalized record and preserves the text itself, including whitespace and line breaks.

## Rendering and paste boundary

Packages contain structured text and formatting, never saved executable HTML. Rendering uses DOM text and constrained style properties. Literal markup in a note remains text. Pasted HTML is first parsed inside an inert template, then converted to the supported document structure; scripts, embedded resources, images, event handlers, links and unsupported styling are not inserted as active markup. Pasted image files use the separate included-picture path. Unsupported rich structures are simplified to the supported text/block model.

The editor uses browser-native `contenteditable` and editing commands to retain ordinary text selection and undo behaviour without a network service or runtime editor dependency. Browser automation verifies the implemented desktop/mobile flow, but it is not a substitute for physical-device testing. Safari/iPhone selection handles, keyboard behaviour, camera format choices, native print/share actions and storage pressure still need device validation.
