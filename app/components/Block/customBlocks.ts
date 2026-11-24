import notice from "./custom/notice.html?raw";
import noticeCss from "./custom/notice.css?raw";

/**
 * Starter's own custom blocks.
 *
 * This file replaces the layer's default list through
 * `modules/custom-blocks.ts`; it is never merged with it. Keep every `type`
 * unique and outside the built-in set.
 */
const customBlocks: CustomBlock[] = [
	{
		type: "Notice",
		schema: [
			{ key: "title", type: "string" },
			{ key: "body", type: "string", subType: "textarea" },
			{ key: "tone", type: "string" },
		],
		file: notice,
		style: noticeCss,
	},
];

export default customBlocks;
