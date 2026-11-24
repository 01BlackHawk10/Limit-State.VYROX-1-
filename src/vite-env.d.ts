/// <reference types="vite/client" />

declare module '*.glb?url' {
  const src: string;
  export default src;
}

declare module '*.usdz?url' {
  const src: string;
  export default src;
}
