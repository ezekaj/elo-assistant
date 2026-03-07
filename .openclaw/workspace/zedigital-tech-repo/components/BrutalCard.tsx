import React from 'react';

interface BrutalCardProps {
  id: string;
  title: string;
  children?: React.ReactNode;
  footer?: { left: string; right: string };
  onClick?: () => void;
  wide?: boolean;
  headerExtra?: React.ReactNode;
}

const BrutalCard: React.FC<BrutalCardProps> = ({ id, title, children, footer, onClick, wide, headerExtra }) => {
  return (
    <div
      className={`card ${wide ? 'card-wide' : ''}`}
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      <div className="card-header">
        <span className="card-id">ID-{id}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {headerExtra}
          <div style={{ width: 10, height: 10, background: 'var(--accent)' }} />
        </div>
      </div>

      <h2>{title}</h2>

      {children && <div className="card-body">{children}</div>}

      {footer && (
        <div className="card-footer">
          <span>{footer.left}</span>
          <span>{footer.right}</span>
        </div>
      )}
    </div>
  );
};

export default BrutalCard;
