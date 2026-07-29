import React from 'react';

function DentalPlusLogo({ dentalColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1px', fontSize: '22px', fontWeight: '700', whiteSpace: 'nowrap' }}>
      <span style={{ color: dentalColor || 'var(--logo-dental-color)' }}>Dental</span>
      <span style={{ color: 'var(--primary)' }}>Plus</span>
    </div>
  );
}

export default DentalPlusLogo;
