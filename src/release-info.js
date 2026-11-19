import packageInfo from '../package.json' with { type: 'json' };

export const APP_VERSION = packageInfo.version;
export const BUILD_ID = typeof __JOBS_BUILD_ID__ === 'string' ? __JOBS_BUILD_ID__ : 'development';
