// vite.config.js
import { resolve } from "path";
import { defineConfig } from "vite";

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, "lib/main.ts"),
      name: "p5kt",
      // the proper extensions will be added
      fileName: "p5.kinetyped",
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into your library
      external: ["p5"],
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          p5: "p5",
          p5kt: "p5kt",
        },
      },
    },
  },
});
