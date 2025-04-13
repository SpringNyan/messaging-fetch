import { defineConfig } from "@rspack/cli";
import { rspack } from "@rspack/core";
import path from "node:path";

export default defineConfig({
  entry: {
    background: "./src/background.ts",
    content: "./src/content.ts",
  },
  output: {
    path: path.resolve(import.meta.dirname, "dist"),
    filename: "[name].js",
    clean: true,
  },
  resolve: {
    extensions: [".ts"],
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: "builtin:swc-loader",
            options: {
              jsc: {
                parser: {
                  syntax: "typescript",
                },
              },
            },
          },
        ],
      },
    ],
  },
  plugins: [
    new rspack.CopyRspackPlugin({
      patterns: ["manifest.json"],
    }),
  ],
});
