import React, { useEffect, useState } from 'react';

interface Product {
  id: number;
  product_id: string;
  title: string;
  brand: string;
  category: { l1: string; l2: string };
  platforms: Array<{ name: string; price: number; url: string }>;
  enrichment_status: string;
}

interface PriceUpdateEvent {
  productId: string;
  title: string;
  platform: string;
  new_price: number;
  timestamp: string;
}

export default function App() {
  const [products, setProducts] = useState<Product[]>([]);
  const [streamLog, setStreamLog] = useState<PriceUpdateEvent[]>([]);

  useEffect(() => {
    // Fetch base page collection via Catalog API
    fetch('http://localhost:8080/api/v1/products')
      .then((res) => res.json())
      .then((payload) => setProducts(payload.data || []))
      .catch((err) => console.error('Product ingestion error:', err));

    // Connect to the Live Gateway Server-Sent Events stream channel 
    const eventSourceInstance = new EventSource('http://localhost:8080/api/v1/stream/price-updates');
    
    eventSourceInstance.addEventListener('price_change', (event: any) => {
      const parsedUpdate: PriceUpdateEvent = JSON.parse(event.data);
      setStreamLog((prev) => [parsedUpdate, ...prev.slice(0, 14)]);
      
      // Real-time UI synchronization: instantly update corresponding product pricing rows [cite: 345]
      setProducts((currentProductsList) =>
        currentProductsList.map((item) => {
          if (item.product_id === parsedUpdate.productId) {
            const updatedPlatforms = item.platforms.map((plat) => 
              plat.name === parsedUpdate.platform ? { ...plat, price: parsedUpdate.new_price } : plat
            );
            return { ...item, platforms: updatedPlatforms };
          }
          return item;
        })
      );
    });

    return () => eventSourceInstance.close();
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui', padding: 24, backgroundColor: '#f8fafc', minHeight: '100vh' }}>
      <header style={{ marginBottom: 32 }}>
        <h1 style={{ color: '#0f172a', margin: 0 }}>Rubick AI Catalog Operations Intelligence Room</h1>
        <p style={{ color: '#64748b', margin: '4px 0 0 0' }}>Production-Ready Pipeline Synchronization Control Interface</p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        {/* Main Product Catalog Display */}
        <section style={{ backgroundColor: '#ffffff', padding: 24, borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, marginBottom: 16, color: '#1e293b' }}>Unified Catalog Registry Rows</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                <th style={{ padding: 12 }}>Identifier</th>
                <th style={{ padding: 12 }}>Product Spec</th>
                <th style={{ padding: 12 }}>Category Track</th>
                <th style={{ padding: 12 }}>Cross-Platform Monitored Values</th>
              </tr>
            </thead>
            <tbody>
              {products.map((item) => (
                <tr key={item.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: 12, fontSize: 13, fontFamily: 'monospace', color: '#64748b' }}>{item.product_id}</td>
                  <td style={{ padding: 12 }}>
                    <strong style={{ color: '#0f172a' }}>{item.title}</strong>
                    <div style={{ fontSize: 12, color: '#64748b' }}>Brand: {item.brand}</div>
                  </td>
                  <td style={{ padding: 12, fontSize: 14 }}>{item.category?.l1} → {item.category?.l2}</td>
                  <td style={{ padding: 12 }}>
                    {item.platforms?.map((p) => (
                      <span key={p.name} style={{ display: 'inline-block', background: '#f1f5f9', padding: '4px 8px', borderRadius: 6, marginRight: 8, fontSize: 12 }}>
                        {p.name}: <strong>₹{p.price}</strong>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* Real-time Event Log Sidebar */}
        <section style={{ backgroundColor: '#0f172a', color: '#38bdf8', padding: 24, borderRadius: 12, boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginTop: 0, color: '#ffffff', fontSize: 18, borderBottom: '1px solid #334155', paddingBottom: 8 }}>
            ⚡ Live SSE Price Delta Feeds [cite: 344]
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxHeight: '60vh', overflowY: 'auto' }}>
            {streamLog.length === 0 ? (
              <p style={{ color: '#475569', fontSize: 14 }}>Listening for pipeline mutation signals... (15s heartbeat)</p>
            ) : (
              streamLog.map((log, index) => (
                <div key={index} style={{ backgroundColor: '#1e293b', padding: 12, borderRadius: 8, borderLeft: '4px solid #4ade80', animation: 'pulse 1s' }}>
                  <div style={{ color: '#f8fafc', fontSize: 13, fontWeight: 'bold' }}>{log.title}</div>
                  <div style={{ fontSize: 12, marginTop: 4, color: '#94a3b8' }}>
                    Platform: <span style={{ color: '#38bdf8' }}>{log.platform}</span> | Price Shifted to: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>₹{log.new_price}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}