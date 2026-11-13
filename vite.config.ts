import fs from "node:fs";
import path from "node:path";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";

const routeDirectory = path.resolve(process.cwd(), "src/routes");

async function scaffoldRoute(routeFilePath: string) {
	if (
		!routeFilePath.startsWith(`${routeDirectory}${path.sep}`) ||
		!routeFilePath.endsWith(".tsx") ||
		path.basename(routeFilePath).startsWith("__")
	) {
		return;
	}

	const routeContents = await fs.promises.readFile(routeFilePath, "utf8");
	if (routeContents.trim()) {
		return;
	}

	const relativeRoutePath = path
		.relative(routeDirectory, routeFilePath)
		.replaceAll(path.sep, "/")
		.replace(/\.tsx$/, "")
		.replace(/\/index$/, "")
		.replace(/^index$/, "");
	const routePath = relativeRoutePath ? `/${relativeRoutePath}` : "/";

	await fs.promises.writeFile(
		routeFilePath,
		`import { createFileRoute } from "@tanstack/react-router";\n\nexport const Route = createFileRoute(${JSON.stringify(routePath)})({\n\tcomponent: RouteComponent,\n});\n\nfunction RouteComponent() {\n\treturn <div>${routePath}</div>;\n}\n`,
		"utf8",
	);
}

function routeScaffoldPlugin() {
	return {
		name: "route-scaffold",
		configureServer(server: {
			watcher: {
				on: (event: "add", callback: (filePath: string) => void) => void;
			};
		}) {
			server.watcher.on("add", (filePath) => {
				void scaffoldRoute(filePath);
			});
		},
	};
}

const config = defineConfig({
	envDir: false,
	resolve: { tsconfigPaths: true },
	plugins: [
		routeScaffoldPlugin(),
		devtools(),
		nitro({
			preset: "vercel",
			rollupConfig: { external: [/^@sentry\//] },
		}),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});

export default config;
