import fs from "node:fs/promises";

import { getDocument, ImageKind, OPS } from "pdfjs-dist/legacy/build/pdf.mjs";

/**
 * If it exists, deletes the file in `path`, else it does nothing.
 *
 * @param {string} path
 *
 * @returns {Promise<void>}
 */
export async function deleteFileIfExists(path) {
	try {
		await fs.rm(path);
	} catch (error) {
		if (error instanceof Error && error.message.includes("ENOENT")) {
			return;
		}

		throw error;
	}
}

/**
 * Extracts info from the PDF in `path`. There are no guarantees as to what the
 * shape of the returned `contents` and `metadata` are, only that they should be
 * stable given the same inputs. Therefore, this function should only be used
 * for snapshots.
 *
 * @param {string} path
 *
 * @returns {Promise<{contents: object[]; metadata: object}>}
 */
export async function getPDFInfo(path) {
	// `typescript-eslint`'s rules are turned off in certain parts since PDF.js
	// doesn't or can't provide concrete types, specially for their lower level
	// APIs, so it's hard to be 100% type safe.

	const loadingTask = getDocument(path);
	const document = await loadingTask.promise;

	// Get metadata

	// @ts-expect-error - `contentLength` exists upon testing.
	const { contentLength, info } = await document.getMetadata();

	/* eslint-disable @typescript-eslint/no-unsafe-assignment */
	const metadata = {
		// @ts-expect-error - It should exist since it's set in the template
		// fixtures using the `lang` property in the `html` element.
		language: info.Language,
		length: contentLength,
		// @ts-expect-error - It should exist since it's set in the template
		// fixtures using the `title` element.
		title: info.Title,
	};
	/* eslint-enable @typescript-eslint/no-unsafe-assignment */

	// Get contents

	const page = await document.getPage(
		// PDF fixtures should only have one page.
		document.numPages,
	);
	const operatorList = await page.getOperatorList();
	const annotations = await page.getAnnotations();

	const contents = [];
	let color = "";
	let font = "";
	let size = 0;
	let text = "";

	/* eslint-disable @typescript-eslint/no-magic-numbers */
	/* eslint-disable @typescript-eslint/no-unsafe-argument */
	/* eslint-disable @typescript-eslint/no-unsafe-assignment */
	/* eslint-disable @typescript-eslint/no-unsafe-member-access */
	for (let i = 0; i < operatorList.fnArray.length; i++) {
		const fn = operatorList.fnArray[i];
		const args = operatorList.argsArray[i];

		if (fn === OPS.setFillRGBColor) {
			[color] = args;
			continue;
		}

		if (fn === OPS.setFont) {
			font = page.commonObjs.get(args[0]).name;
			[, size] = args;
			continue;
		}

		if (fn === OPS.showText) {
			text += args[0][0].unicode;
			continue;
		}

		if (fn === OPS.endText) {
			const content = { color, font, size, text, type: "TEXT" };

			const link = annotations.find(
				// This function is discarded before `text` is reassigned.
				// eslint-disable-next-line @typescript-eslint/no-loop-func
				(a) => a.overlaidText === text && a.subtype === "Link",
			);
			if (link !== undefined) {
				content.type = "LINK";
				// @ts-expect-error - `url` is purposefully added to `content`, taking
				// advantage of JavaScript's looseness.
				content.url = link.url;
			}

			contents.push(content);

			color = "";
			font = "";
			size = 0;
			text = "";

			continue;
		}

		if (fn === OPS.paintImageXObject) {
			const {
				dataLen: length,
				height,
				kind: kindValue,
				width,
			} = page.objs.get(args[0]);

			// Not sure why this is flagged since `kindLabel` is actually used.
			// eslint-disable-next-line no-useless-assignment
			let kindLabel = "";
			switch (kindValue) {
				case ImageKind.GRAYSCALE_1BPP: {
					kindLabel = "GRAYSCALE_1BPP";
					break;
				}

				case ImageKind.RGB_24BPP: {
					kindLabel = "RGB_24BPP";
					break;
				}

				case ImageKind.RGBA_32BPP: {
					kindLabel = "RGBA_32BPP";
					break;
				}

				default: {
					throw new Error("unknown ImageKind value " + kindValue);
				}
			}

			contents.push({ height, kind: kindLabel, length, type: "IMAGE", width });
		}
	}
	/* eslint-enable @typescript-eslint/no-magic-numbers */
	/* eslint-enable @typescript-eslint/no-unsafe-argument */
	/* eslint-enable @typescript-eslint/no-unsafe-assignment */
	/* eslint-enable @typescript-eslint/no-unsafe-member-access */

	await loadingTask.destroy();

	return { contents, metadata };
}

/**
 * Extracts the text from the PDF in `path`.
 *
 * @param {string} path
 *
 * @returns {Promise<string>}
 */
export async function getPDFText(path) {
	const loadingTask = getDocument(path);
	const document = await loadingTask.promise;
	const page = await document.getPage(
		// PDF fixtures should only have one page.
		document.numPages,
	);

	let text = "";
	for (const item of (await page.getTextContent()).items) {
		if ("str" in item) {
			text += item.str;
		}

		if ("hasEOL" in item && item.hasEOL) {
			text += "\n";
		}
	}

	await loadingTask.destroy();

	return text;
}

/**
 * Delays for the specified amount of time in `duration` in milliseconds.
 *
 * @param {number} duration
 *
 * @returns {Promise<void>}
 */
export async function sleep(duration) {
	// This is the most straightforward way to create a promisified delay
	// function.
	// eslint-disable-next-line promise/avoid-new
	return new Promise((resolve) => {
		setTimeout(resolve, duration);
	});
}
