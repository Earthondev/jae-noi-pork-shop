import assert from 'node:assert/strict';
import test from 'node:test';
import { productsForGuide } from '../lib/guide-products.ts';
import { catalogProductsFromRows } from '../lib/product-catalog.ts';

const row = (id, name, price, status = 'เปิดขาย') => [id, name, '2 ชิ้น', 'รายละเอียดจากร้าน', price, status];
const catalogue = (rows) => catalogProductsFromRows([[], ...rows]);

test('guide uses updated catalogue values and excludes hidden or repurposed IDs', () => {
  const first = catalogue([row('NAEM250','แหนมหมู','130')]);
  assert.equal(productsForGuide('naem-moo',first)[0].price,130);
  const changed = catalogue([row('NAEM250','แหนมหมูสูตรใหม่','175')]);
  assert.equal(productsForGuide('naem-moo',changed)[0].price,175);
  assert.equal(productsForGuide('naem-moo',changed)[0].unit,'2 ชิ้น');
  assert.deepEqual(productsForGuide('naem-moo', catalogue([row('NAEM250','แหนมหมู','130','ซ่อนสินค้า')])),[]);
  assert.deepEqual(productsForGuide('naem-moo', catalogue([row('NAEM250','หม่ำหมู','130')])),[]);
});

test('comparison keeps separate SKU prices and does not guess missing prices', () => {
  const selected = productsForGuide('kaep-moo',catalogue([
    row('PORKRIND1','กากหมูโบราณ','220'), row('P0006','แคปหมูแบบถุง','150'),
    row('P0007','แคบหมูแบบกิโลกรัม',''), row('SAUSAGE10','ไส้กรอกอีสาน','100'),
  ]));
  assert.deepEqual(selected.map(p=>p.price),[220,150,null]);
  assert.deepEqual(productsForGuide('sai-krok-isan',[]),[]);
});
