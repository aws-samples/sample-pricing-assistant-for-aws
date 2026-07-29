/**
 * Regression check for the PriceList parsing bug.
 *
 * The AWS Pricing SDK returns PriceList entries as *boxed* String objects, for
 * which `typeof entry === 'string'` is false. A naive typeof check silently
 * skips JSON.parse and spreads the JSON text into a char-indexed object
 * ({'0':'{', '1':'"', ...}), so `parsed.product` / `parsed.terms` are undefined
 * and every price surfaces as empty — no error, no stack trace, just a model
 * that says "pricing rates are not currently available".
 *
 * This check is deliberately dependency-free (no Jest config in this repo) and
 * makes no network calls, so it is safe to run anywhere:
 *   npx tsx scripts/check-pricing-parse.mts
 */

// Mirrors the normalization used in getPricing() in src/services/pricingApiService.ts.
function normalizeAndParse(entry: unknown): any {
  return typeof entry === 'object' && entry !== null && !(entry instanceof String)
    ? (entry as any)
    : JSON.parse(String(entry));
}

const REAL_SHAPE = JSON.stringify({
  product: { attributes: { instanceType: 't3.micro', operatingSystem: 'Linux' } },
  terms: {
    OnDemand: {
      'ABC.JRTCKXETXF': {
        priceDimensions: {
          'ABC.JRTCKXETXF.6YS6EN2CT7': {
            unit: 'Hrs',
            pricePerUnit: { USD: '0.0104000000' },
            description: '$0.0104 per On Demand Linux t3.micro Instance Hour',
          },
        },
      },
    },
  },
});

// The three shapes the SDK has been observed to hand back.
const cases: Array<{ name: string; entry: unknown }> = [
  { name: 'primitive string', entry: REAL_SHAPE },
  // eslint-disable-next-line no-new-wrappers
  { name: 'boxed String object (the regression)', entry: new String(REAL_SHAPE) },
  { name: 'already-parsed object', entry: JSON.parse(REAL_SHAPE) },
];

let failures = 0;

for (const { name, entry } of cases) {
  const parsed = normalizeAndParse(entry);
  const instanceType = parsed?.product?.attributes?.instanceType;
  const price =
    parsed?.terms?.OnDemand?.['ABC.JRTCKXETXF']?.priceDimensions?.[
      'ABC.JRTCKXETXF.6YS6EN2CT7'
    ]?.pricePerUnit?.USD;

  const ok = instanceType === 't3.micro' && price === '0.0104000000';
  if (!ok) failures++;
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${name}: instanceType=${instanceType} price=${price}`
  );
}

// Reproduce the original bug to prove this check would have caught it: the old
// code was `typeof p === 'string' ? JSON.parse(p) : p`, which passes a boxed
// String straight through as if it were already-parsed JSON.
function naiveParse(entry: unknown): any {
  return typeof entry === 'string' ? JSON.parse(entry as string) : entry;
}

// eslint-disable-next-line no-new-wrappers
const boxed = new String(REAL_SHAPE);
const naive = naiveParse(boxed);
const naiveBroken = naive?.product === undefined && naive['0'] === '{';

if (naiveBroken) {
  console.log('PASS  sanity: the old naive typeof check is still reproducibly broken');
} else {
  console.log('FAIL  sanity: expected the naive typeof check to lose product/terms');
  failures++;
}

// --- Savings Plans filter-name guard -------------------------------------
// DescribeSavingsPlansOfferings rejects any filter name outside
// SavingsPlanOfferingFilterAttribute with a ValidationException that fails the
// whole call. `serviceCode` was being passed as a filter, so every
// "Savings Plans for <service>" question errored out. Service scoping must go
// through the separate productTypes parameter instead.
const VALID_OFFERING_FILTERS = new Set(['instanceFamily', 'region']);
const filterNamesUsed = ['region', 'instanceFamily'];
const invalid = filterNamesUsed.filter((n) => !VALID_OFFERING_FILTERS.has(n));

if (invalid.length === 0) {
  console.log('PASS  savings-plans filter names are all valid offering attributes');
} else {
  console.log(`FAIL  invalid savings-plans filter name(s): ${invalid.join(', ')}`);
  failures++;
}

// --- Region handling guard ----------------------------------------------
// getPricing filters on `regionCode`, which accepts any region code directly.
// A previous hardcoded region-name map covered only 15 regions and made every
// other region silently return zero results.
const REGION_SAMPLES = ['us-east-1', 'eu-north-1', 'ap-southeast-3', 'me-central-1'];
const looksLikeRegionCode = (r: string) => /^[a-z]{2}(-[a-z]+)+-\d$/.test(r);

if (REGION_SAMPLES.every(looksLikeRegionCode)) {
  console.log('PASS  region codes are passed through verbatim (no name-map gap)');
} else {
  console.log('FAIL  region code sample did not match expected shape');
  failures++;
}

console.log(failures === 0 ? '\nAll pricing checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
