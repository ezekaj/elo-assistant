
export interface Service {
  id: string;
  title: string;
  description: string;
  icon: string;
  capabilities?: string[];
}

export interface Project {
  id: string;
  title: string;
  category: string;
  image: string;
  description: string;
  technologies: string[];
  year: string;
  client: string;
  featured?: boolean;
  gallery?: string[];
  liveUrl?: string;
  githubUrl?: string;
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export enum NavLink {
  HOME = 'home',
  SERVICES = 'services',
  WORK = 'work',
  ADVISOR = 'advisor',
  CONTACT = 'contact'
}
