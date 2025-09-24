const { defineConfig } = require("../../../../index.js");

module.exports = defineConfig({
	pdfOptions: {
		displayHeaderFooter: true,
		footerTemplate:
			'<footer style="display: flex; flex-direction: column; font-size: 14px">' +
			'<p>Location: <span class="url"></span></p>' +
			'<p>Current Page: <span class="pageNumber"></span></p>' +
			'<p>Total Pages: <span class="totalPages"></span></p>' +
			"</footer>",
	},
});
