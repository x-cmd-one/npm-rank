import { join } from "https://deno.land/std/path/mod.ts";
import { z } from "https://deno.land/x/zod@v3.20.0/mod.ts";
import ProgressBar from "https://deno.land/x/progress@v1.3.9/mod.ts";
import { BatchQueue } from "https://deno.land/x/batch_queue@v0.0.1/mod.ts";

const requestAmount = 200;
const batchSize = 250;
const promiseConcurrency = 4;

const buildDirectoryPath = "dist/";
const currentFileDirectory = new URL(".", import.meta.url).pathname;
const outputFilenameRawJson = "list-package-names.json";
const buildDirectory = join(currentFileDirectory, `../${buildDirectoryPath}`);
const outputFilePathRawJson = join(buildDirectory, outputFilenameRawJson);

let completed = 0;
const progress = Deno.isatty(Deno.stdout.rid)
	? new ProgressBar({
		title: "Package progress:",
		total: requestAmount,
	})
	: undefined;

function buildURL(index: number, max = 250) {
	// we can get a max of 250 at a time, sorting by popularity only, and using an empty search query (by abusing text filters and using a redundant boost-exact:false filter)
	return `https://registry.npmjs.com/-/v1/search?size=${max}&popularity=1.0&quality=0.0&maintenance=0.0&text=boost-exact:false&from=${index}`;
}

function pageURL(page: number) {
	return buildURL(page * batchSize);
}

const PackageSchema = z.object({
	name: z.string(),
	version: z.string(),
	description: z.string().optional(),
	keywords: z.array(z.string()).optional(),
	publisher: z.object({
		username: z.string(),
		email: z.string(),
	}),
	maintainers: z.array(z.object({
		username: z.string(),
		email: z.string(),
	})).optional(),
	links: z.object({
		npm: z.string(),
		homepage: z.string().optional(),
		repository: z.string().optional(),
	}),
});

const FetchSchema = z.object({
	objects: z.array(z.object({
		package: PackageSchema,
	})),
});

type Package = z.infer<typeof PackageSchema>;

async function getPage(page: number): Promise<Package[]> {
	const request = await fetch(pageURL(page));

	const { objects } = FetchSchema.parse(await request.json());

	return objects.map((obj) => obj.package.name);
}

// handy sleep timer
const timeout = (time) =>
	new Promise((resolve) => setTimeout(() => resolve(true), time));

const queuedRequests = new BatchQueue(promiseConcurrency);
const queuedPackageData = new BatchQueue(1);
let packageData = [];

const requestsFunctions = Array.from({ length: requestAmount }).map((_, i) => {
	return async () => {
		const packages = await getPage(i);
		completed++;
		if (progress) {
			progress.render(completed);
		} else {
			console.log(`Completed ${completed} of ${requestAmount} requests.`);
		}

		const queuedFunction = async function () {
			await packageData.push(...packages);
		};

		queuedPackageData.queue(queuedFunction);

		return true;
	};
});

queuedRequests.queue(...requestsFunctions);

await queuedRequests.run();
await queuedRequests.allSettled;
await timeout(500);

console.log(`Completed all queued requests tasks: ${queuedRequests.running}`);

await queuedPackageData.run();
const packages = packageData;

console.log(`Fetched a total of ${packages.length} packages.`);

await Deno.writeTextFile(outputFilePathRawJson, JSON.stringify(packages));

function getFileSizeSync(filePath) {
	try {
		const fileInfo = Deno.statSync(filePath);
		return fileInfo.size;
	} catch (error) {
		console.error("Error getting file size:", error);
	}
}

console.log(
	`Wrote ${packages.length} packages to ${outputFilePathRawJson} sized at ${
		getFileSizeSync(outputFilePathRawJson)
	} bytes`,
);
