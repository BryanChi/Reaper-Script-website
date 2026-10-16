// Discount codes for the PayPal checkout. Only a SHA-256 of each code is stored here, so the code
// itself isn't readable from the repo. A code is matched in upper case with spaces and dashes removed
// ("Early-Testers" = "EARLYTESTERS"). To add one: node -e "console.log(require('crypto').createHash('sha256').update('YOURCODE').digest('hex'))"
const crypto = require('crypto');
const PRODUCTS = require('./products');

const DISCOUNTS = [
	{
		id: 'early-testers',
		label: 'Early testers',
		hash: '62c564a13404c3adcfc7b6e7615209ecb37422be9f0f210566dc845f4f2535b6', // EARLYTESTERS
		percent: 40,
		products: null // null = every product
	},
	{
		// TEMPORARY: bryan's real-money test of the checkout (2026-10-16). Remove after the test.
		id: 'owner-test',
		label: 'Test',
		hash: 'a349afea1d0ed201fbf160e9d9ef45477bfe7b10286867815cb8b1a87d373acf',
		percent: 99,
		products: null
	}
];

function normalizeCode(code) {
	return String(code || '').toUpperCase().replace(/[\s-]+/g, '');
}

function findDiscount(code, product) {
	const c = normalizeCode(code);
	if (!c) return null;
	const h = crypto.createHash('sha256').update(c).digest('hex');
	const d = DISCOUNTS.find(x => x.hash === h);
	if (!d || (d.products && !d.products.includes(product))) return null;
	return d;
}

function discountById(id, product) {
	const d = DISCOUNTS.find(x => x.id === id);
	if (!d || (d.products && !d.products.includes(product))) return null;
	return d;
}

// The USD amount a product costs with an optional discount, as PayPal wants it ("55.80")
function priceFor(product, discount) {
	const list = Number(PRODUCTS[product].price);
	const pct = discount ? discount.percent : 0;
	return (Math.round(list * (100 - pct)) / 100).toFixed(2);
}

module.exports = { findDiscount, discountById, priceFor };
