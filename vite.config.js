import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function getBasePath() {
  const repository = process.env.GITHUB_REPOSITORY;

  if (!repository) {
    return "/";
  }

  const [, repoName] = repository.split("/");

  return repoName ? `/${repoName}/` : "/";
}

export default defineConfig({
  plugins: [react()],
  base: getBasePath(),
  server: {
    host: "0.0.0.0",
    port: 4173
  }
});
