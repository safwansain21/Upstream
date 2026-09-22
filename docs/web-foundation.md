# Web foundation checkpoint

Owner: web_foundation subagent. Work is partial and has not yet been built or visually verified.

Implemented under `apps/web/src`: root layout with self-hosted specified fonts; full design tokens/responsive CSS; landing page; reusable BrandMark/Brand/Arrow, AppHeader, RiverDivider/RiverPanel/AtlasMapFrame/RiverPhotoMask/EvidenceFlowLine, PageIntro, OriginBadge/RoleBadge/CaseStatus, EmptyState/InlineError/LoadingState, ReadinessChecklist, Footer/PolicyPage; data-driven NetworkDiagram and ReachLegend; native illustrative river art.

`AppHeader({org?:string})` switches public/operational navigation. It does not include auth/session logic. Pages must render it themselves. Root layout only contains fonts, CSS, skip link and children. Every page needs `id="main-content"` on its main region.

`NetworkDiagram` props: `stations: {id,label,x,y,description?}[]`, `reaches: {id,label?,from,to,points?:[number,number][],state?:"candidate"|"excluded"|"unreviewed"}[]`, optional `selectedStation`, `onSelectStation`, `label`, `compact`. Coordinates are schematic SVG coordinates supplied by the caller, never invented scientific records. Station list buttons are keyboard accessible. All scientific interpretation comes from caller data. `RiverPanel`, `AtlasMapFrame` take `children` and optional `className`.

Generic integration CSS available: `.page-shell`, `.page-intro`, `.case-grid`, `.tab-nav`, `.surface`, `.stack`, `.notice`, `.breadcrumbs`, `.form-field`, `.field-help`, `.field-error`, `.button-row`, `.table-scroll`, `.data-table`, `.section-heading`, `.muted`, `.numeric`, `.mono`.

Remaining immediately: public how-it-works, example chooser, privacy/accessibility/terms/status pages; not-found/error/loading routes; parse/typecheck/build; desktop/mobile visual QA. Parent integrates all dynamic API routes separately. Landing reference photo slot optional; current river scene is deliberately labelled illustrative vector, not geographic imagery.

No fake successful mutations, canned scientific result values, or trust badges are provided. Example chooser will link synthetic scenarios requiring parent API integration.
