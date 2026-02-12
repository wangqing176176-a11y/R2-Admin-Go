module.exports=[33290,a=>{"use strict";var b=a.i(7997);let c=`
(() => {
  try {
    const key = "r2_admin_theme_v1";
    const stored = localStorage.getItem(key);
    const mode = stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
    const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    const isDark = mode === "dark" || (mode === "system" && prefersDark);
    document.documentElement.classList.toggle("dark", isDark);
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", isDark ? "#111827" : "#f9fafb");
  } catch {}
})();
`;function d({children:a}){return(0,b.jsxs)("html",{lang:"zh-CN",suppressHydrationWarning:!0,children:[(0,b.jsxs)("head",{children:[(0,b.jsx)("script",{dangerouslySetInnerHTML:{__html:c}}),(0,b.jsx)("meta",{name:"theme-color",content:"#f9fafb"}),(0,b.jsx)("link",{rel:"icon",href:"/brand.png?v=1",type:"image/png"}),(0,b.jsx)("link",{rel:"apple-touch-icon",href:"/brand.png?v=1"})]}),(0,b.jsx)("body",{className:"min-h-dvh",children:a})]})}a.s(["default",()=>d,"metadata",0,{title:"R2 Admin Go",description:"Serverless Cloudflare R2 manager",icons:{icon:[{url:"/brand.png?v=1",type:"image/png"}],shortcut:[{url:"/brand.png?v=1",type:"image/png"}],apple:[{url:"/brand.png?v=1",type:"image/png"}]}}])}];

//# sourceMappingURL=app_layout_tsx_271801d7._.js.map