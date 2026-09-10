import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogueJsonLd, productJsonLdNode, productPageJsonLd, productPath, productOrderState, catalogueSitemap } from '../lib/catalogue-seo.ts';
import { guideJsonLd, PRODUCT_GUIDES, SITE_URL } from '../lib/seo.ts';

const product = { id: 'PORKRIND1', name: 'กากหมูโบราณ', unit: '1 กล่อง', detail: 'ทอดสด', image: '/images/products/product-placeholder.svg', price: 220, status: 'เปิดขาย', category: 'กากหมู', badge: '', updatedAt: '2026-09-10T07:00:00.000Z' };
const context = { rounds: [{ productScope: 'all', productIds: [] }], shippingFee: 50, freeShippingMinimum: 500 };
const products = [product, { ...product, id: 'P0006', name: 'แคปหมูโบราณ แบบถุง', price: 150 }, { ...product, id: 'P0007', name: 'แคปหมู แบบ 1 กิโลกรัม', price: 400 }, { ...product, id: 'P0005', name: 'หม่ำหมู', price: 200 }];

test('every catalogue SKU has its own identity, including newly created products', () => {
  const list = JSON.parse(catalogueJsonLd(products, context));
  assert.equal(list.numberOfItems, 4);
  assert.equal(new Set(list.itemListElement.map(x => x.item['@id'])).size, 4);
  assert.deepEqual(list.itemListElement.map(x => x.item.offers.price), [220, 150, 400, 200]);
  assert.equal(list.itemListElement[3].item.name, 'หม่ำหมู');
});

test('admin price/name/unit/image changes propagate without changing the product identity', () => {
  const edited = { ...product, name: 'ชื่อใหม่ </script><script>alert(1)</script>', price: 245, unit: '500 กรัม', image: '/media/products/new.jpg', detail: 'รายละเอียดใหม่' };
  const before = productJsonLdNode(product, context);
  const after = productJsonLdNode(edited, context);
  assert.equal(after['@id'], before['@id']);
  assert.equal(after.offers.price, 245);
  assert.equal(after.size, '500 กรัม');
  assert.equal(after.image, SITE_URL + edited.image);
  const catalogue = catalogueJsonLd([edited], context);
  const detail = productPageJsonLd(edited, context);
  assert.doesNotMatch(catalogue, /<\/script/i);
  assert.doesNotMatch(detail, /<\/script/i);
  assert.deepEqual(JSON.parse(catalogue).itemListElement[0].item, JSON.parse(detail)['@graph'][0]);
});

test('accepting preorders uses round membership, never just a global open flag', () => {
  assert.equal(productJsonLdNode(product, context).offers.availability, 'https://schema.org/PreOrder');
  for (const rounds of [[], [{ productScope: 'selected', productIds: ['P0006'] }]]) {
    assert.equal(productOrderState(product, { ...context, rounds }).canOrder, false);
    assert.equal(productJsonLdNode(product, { ...context, rounds }).offers.availability, 'https://schema.org/OutOfStock');
  }
  assert.equal(productOrderState(product, { ...context, rounds: [{ productScope: 'selected', productIds: ['PORKRIND1'] }] }).canOrder, true);
  assert.equal(productOrderState({ ...product, status: 'ปิดชั่วคราว' }, context).canOrder, false);
});

test('missing or invalid prices never generate a made-up Offer', () => {
  for (const price of [null, 0, -1, NaN, Infinity]) {
    assert.equal(productJsonLdNode({ ...product, price }, context).offers, undefined);
    assert.equal(JSON.parse(productPageJsonLd({ ...product, price }, context))['@graph'].length, 1);
  }
  assert.equal(productJsonLdNode({ ...product, status: 'รอข้อมูล' }, context).offers, undefined);
});

test('shipping follows checkout settings and never invents a delivery or return policy', () => {
  assert.equal(productJsonLdNode(product, context).offers.shippingDetails.shippingRate.value, 50);
  assert.equal(productJsonLdNode({ ...product, price: 500 }, context).offers.shippingDetails.shippingRate.value, 0);
  assert.equal(productJsonLdNode(product, { ...context, shippingFee: 65 }).offers.shippingDetails.shippingRate.value, 65);
  assert.equal(productJsonLdNode(product, { ...context, shippingFee: null }).offers.shippingDetails, undefined);
  const offer = productJsonLdNode(product, context).offers;
  assert.equal(offer.hasMerchantReturnPolicy, undefined);
  assert.equal(offer.shippingDetails.deliveryTime, undefined);
});

test('sitemap tracks the visible catalogue and real modification date without reserved route collisions', () => {
  const xml = catalogueSitemap(products);
  assert.match(xml, /xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9"/);
  assert.ok(xml.includes(productPath('P0005')));
  assert.ok(xml.includes('<lastmod>2026-09-10T07:00:00.000Z</lastmod>'));
  assert.ok(!catalogueSitemap(products.filter(x => x.id !== 'P0005')).includes(productPath('P0005')));
  assert.equal(productPath('naem-moo'), '/products/item/naem-moo');
  assert.ok(!xml.includes('/admin') && !xml.includes('/track'));
});

test('editorial guides contain breadcrumbs without selling a fixed-price product', () => {
  for (const guide of PRODUCT_GUIDES) {
    const data = JSON.parse(guideJsonLd(guide.slug));
    assert.equal(data['@type'], 'BreadcrumbList');
    assert.equal(data.itemListElement[2].item, `${SITE_URL}/products/${guide.slug}`);
    assert.equal(data.offers, undefined);
  }
});
