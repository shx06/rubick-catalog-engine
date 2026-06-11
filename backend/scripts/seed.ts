import { Client } from 'pg';

const client = new Client({ connectionString: process.env.DATABASE_URL });

async function seed() {
  await client.connect();
  
  const insertProductQuery = `
    INSERT INTO products (product_id, title, brand, category, attributes, platforms, enrichment_status)
    VALUES 
    ($1, $2, $3, $4, $5, $6, 'complete')
    ON CONFLICT (product_id) DO NOTHING;
  `;

  await client.query(insertProductQuery, [
    "nike_airmax_42_blk",
    "Nike Air Max Black Running Shoes",
    "Nike",
    JSON.stringify({ l1: "Footwear", l2: "Sneakers" }),
    JSON.stringify({ color: "black", rawSize: "EU42" }),
    JSON.stringify([
      { name: "Amazon", price: 3999, url: "https://amazon.in/mock" },
      { name: "Flipkart", price: 4100, url: "https://flipkart.com/mock" }
    ])
  ]);

  console.log("Database seed injection executed cleanly.");
  await client.end();
}
seed();