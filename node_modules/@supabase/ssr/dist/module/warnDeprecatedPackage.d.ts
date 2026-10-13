/**
 * Emits a one-time console warning when the running app still declares one of
 * the deprecated `@supabase/auth-helpers-*` packages, nudging consumers to
 * migrate to `@supabase/ssr`. No-op outside Node-like runtimes.
 *
 * @category Deprecated
 */
export declare function warnIfUsingDeprecatedAuthHelpersPackage(): void;
