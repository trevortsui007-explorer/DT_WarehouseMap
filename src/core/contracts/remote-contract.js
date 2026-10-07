/**
 * @typedef {Object} DraftSaveRequest
 * @property {number} expectedDraftRevision Optimistic concurrency token; not a published version.
 * @property {number|null} basedOnPublishedVersion
 * @property {6} schemaVersion
 * @property {import('./layout-contract.js').Layout} layout Runtime-free layout snapshot.
 */
/**
 * @typedef {Object} PublishedLayoutResponse
 * @property {string} layoutCode
 * @property {number|null} publishedVersion Null explicitly means never published.
 * @property {import('./layout-contract.js').Layout|null} layout
 * @property {{canEditLayout: boolean, canSaveDraft: boolean, canPublishLayout: boolean}} capabilities
 */
/**
 * @typedef {Object} ApiError
 * @property {'LAYOUT_DRAFT_CONFLICT'|'PUBLISHED_LOCATION_RENAME_FORBIDDEN'|'LOCATION_IN_USE'|'PUBLISH_VALIDATION_FAILED'|'SERVER_UNAVAILABLE'|'UNAUTHORIZED'|'FORBIDDEN'} code
 * @property {string} message
 * @property {Object|Array|null} details Machine-readable reasons, never parse localized message text.
 */
// 远程契约供未来 C# 服务对接：草稿修订号用于并发控制，发布版本号只在服务端发布成功后变化。
export {};
