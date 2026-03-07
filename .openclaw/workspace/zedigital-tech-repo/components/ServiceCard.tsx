import React from 'react';
import { Code, Brain, Server, Shield } from 'lucide-react';
import { Service } from '../types';
import BrutalCard from './BrutalCard';

const ICON_MAP: Record<string, React.ReactNode> = {
  Code: <Code style={{ width: 14, height: 14, color: 'var(--accent-2)' }} />,
  Brain: <Brain style={{ width: 14, height: 14, color: 'var(--accent-2)' }} />,
  Server: <Server style={{ width: 14, height: 14, color: 'var(--accent-2)' }} />,
  Shield: <Shield style={{ width: 14, height: 14, color: 'var(--accent-2)' }} />,
};

interface ServiceCardProps {
  service: Service;
  index: number;
}

const ServiceCard: React.FC<ServiceCardProps> = ({ service, index }) => {
  return (
    <BrutalCard
      id={String(index + 1).padStart(2, '0')}
      title={service.title}
      headerExtra={ICON_MAP[service.icon]}
      footer={{ left: 'CAPABILITY', right: `${(service.capabilities || []).length} ITEMS` }}
    >
      <p style={{ marginBottom: '12px' }}>{service.description}</p>
      <div style={{ marginTop: '8px' }}>
        {(service.capabilities || []).slice(0, 3).map((cap, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '6px', marginBottom: '4px' }}>
            <span style={{ color: 'var(--accent)', flexShrink: 0 }}>+</span>
            <span>{cap}</span>
          </div>
        ))}
      </div>
    </BrutalCard>
  );
};

export default ServiceCard;
