import React from 'react';
import { ExternalLink, Github } from 'lucide-react';
import { Project } from '../types';
import BrutalCard from './BrutalCard';

interface ProjectCardProps {
  project: Project;
  onClick?: () => void;
}

const ProjectCard: React.FC<ProjectCardProps> = ({ project, onClick }) => {
  const headerLinks = (
    <div style={{ display: 'flex', gap: '6px' }}>
      {project.githubUrl && (
        <a
          href={project.githubUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'rgba(255,255,255,0.4)' }}
        >
          <Github style={{ width: 12, height: 12 }} />
        </a>
      )}
      {project.liveUrl && (
        <a
          href={project.liveUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          style={{ color: 'var(--accent-2)' }}
        >
          <ExternalLink style={{ width: 12, height: 12 }} />
        </a>
      )}
    </div>
  );

  const projectUrl = project.liveUrl || project.githubUrl;

  return (
    <BrutalCard
      id={`${project.year}-${project.id}`}
      title={project.title}
      onClick={onClick}
      headerExtra={headerLinks}
      footer={{ left: project.category, right: project.year }}
    >
      <p style={{ marginBottom: '10px' }}>
        {project.description.length > 120
          ? project.description.slice(0, 120) + '...'
          : project.description}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '8px' }}>
        {project.technologies.slice(0, 4).map((tech, i) => (
          <span key={i} className="tech-tag">{tech}</span>
        ))}
      </div>
      {projectUrl && (
        <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid var(--border)' }}>
          <a
            href={projectUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'var(--accent-2)',
              fontFamily: 'var(--font-code)',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              textDecoration: 'none',
              transition: 'color 0.2s',
            }}
          >
            <ExternalLink style={{ width: 12, height: 12 }} />
            View Project
          </a>
        </div>
      )}
    </BrutalCard>
  );
};

export default ProjectCard;
