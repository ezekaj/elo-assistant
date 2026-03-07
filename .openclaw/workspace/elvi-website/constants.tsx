
import React from 'react';
import { Code, Brain, Server, Shield, Layers, Terminal, Database, Figma, Zap } from 'lucide-react';
import { Service, Project } from './types';

export const SERVICES: Service[] = [
  {
    id: 'web-development',
    title: 'Web Development',
    description: 'Full-stack applications built for scale, from responsive frontends to robust backend systems. We deliver performance-optimized solutions that drive engagement and conversion.',
    icon: 'Code',
    capabilities: [
      'Full-stack web applications with React, Next.js, and Node.js',
      'Responsive design optimized for all devices',
      'Performance optimization and Core Web Vitals improvement',
      'E-commerce platforms with payment integration',
      'Progressive Web Apps (PWA) development',
      'CMS integration and headless architecture'
    ]
  },
  {
    id: 'ai-solutions',
    title: 'AI Solutions',
    description: 'Transform your business with intelligent automation and machine learning integration. From predictive analytics to custom AI models, we build systems that learn and adapt.',
    icon: 'Brain',
    capabilities: [
      'Machine learning model development and deployment',
      'Natural language processing and chatbot integration',
      'Predictive analytics and business intelligence',
      'Computer vision and image recognition systems',
      'Intelligent automation workflows',
      'Custom AI model training and fine-tuning'
    ]
  },
  {
    id: 'software-development',
    title: 'Software Development',
    description: 'Custom enterprise applications and API development tailored to your unique workflows. We architect scalable systems that grow with your business demands.',
    icon: 'Server',
    capabilities: [
      'Custom enterprise application development',
      'RESTful and GraphQL API design and implementation',
      'Cloud-native architecture (AWS, GCP, Azure)',
      'Microservices and distributed systems',
      'Legacy system modernization and migration',
      'DevOps and CI/CD pipeline setup'
    ]
  },
  {
    id: 'cybersecurity',
    title: 'Cybersecurity',
    description: 'Comprehensive security audits, penetration testing, and compliance solutions. We identify vulnerabilities and implement robust protection strategies to safeguard your digital assets.',
    icon: 'Shield',
    capabilities: [
      'Comprehensive security audits and assessments',
      'Penetration testing and vulnerability scanning',
      'Compliance implementation (SOC 2, GDPR, HIPAA)',
      'Security architecture design and review',
      'Incident response planning and execution',
      'Security awareness training programs'
    ]
  }
];

export const PROJECTS: Project[] = [
  {
    id: '1',
    title: 'Sofia Hotel Concierge',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&q=80&w=1200',
    description: 'AI voice assistant for Hotel Lärchenhof in Austria. Handles guest inquiries via SIP trunk integration with Twilio, LiveKit, and Cartesia TTS. Fully German-speaking with natural conversation flow.',
    technologies: ['Python', 'LiveKit', 'Twilio SIP', 'Cartesia TTS', 'Deepgram', 'OpenRouter'],
    year: '2025',
    client: 'Hotel Lärchenhof',
    featured: true,
    gallery: [
      'https://images.unsplash.com/photo-1551882547-ff40c63fe5fa?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1520250497591-112f2f40a3f4?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/sofia-hotel/'
  },
  {
    id: '2',
    title: 'ELO-AGI (NEURO)',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1620712943543-bcc4688e7485?auto=format&fit=crop&q=80&w=1200',
    description: 'Neuroscience-inspired AGI with 38 cognitive modules achieving 96.4% success rate. Local AI coding assistant with continual learning, causal reasoning, and zero API costs.',
    technologies: ['Python', 'Ollama', 'Knowledge Graphs', 'Continual Learning', 'EWC', 'PackNet'],
    year: '2026',
    client: 'Z.E Digital Tech',
    featured: true,
    gallery: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/elo-agi/'
  },
  {
    id: '3',
    title: 'KartodromAl',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=1200',
    description: 'High-performance racing facility website with PWA capabilities, live telemetry dashboards, and multilingual support. Neon gaming aesthetic achieving Lighthouse 95+ scores.',
    technologies: ['Next.js 15', 'React 19', 'TypeScript', 'Framer Motion', 'i18next', 'PWA'],
    year: '2025',
    client: 'KartodromAl',
    featured: true,
    gallery: [
      'https://images.unsplash.com/photo-1504945005722-33670dcaf685?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1200'
    ],
    githubUrl: 'https://github.com/ezekaj/KartodromAl-Web',
    liveUrl: 'https://ezekaj.github.io/KartodromAl-Web/'
  },
  {
    id: '4',
    title: 'ZEO Dental Platform',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1629909613654-28e377c37b09?auto=format&fit=crop&q=80&w=1200',
    description: 'Modern dental clinic booking platform with AI-powered chat (Google Gemini), appointment management, and automated email notifications. Full-stack healthcare SaaS solution.',
    technologies: ['React 19', 'Vite', 'Google Gemini', 'Fastify', 'PostgreSQL', 'SMTP'],
    year: '2025',
    client: 'ZEO Dental Clinic',
    gallery: [
      'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1606811841689-23dfddce3e95?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://zeodentalclinic.com'
  },
  {
    id: '5',
    title: 'PRP-AI Assistant',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1555255707-c07966088b7b?auto=format&fit=crop&q=80&w=1200',
    description: 'Enterprise-grade autonomous AI system with self-spawning agents and parallel execution. 12-factor compliant with 95%+ success rate, predictive intelligence, and self-healing recovery.',
    technologies: ['Python', 'Flask', 'Celery', 'Redis', 'PostgreSQL', 'Anthropic API'],
    year: '2026',
    client: 'Enterprise SaaS',
    gallery: [
      'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1518186285589-2f7649de83e0?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/prp-ai-assistant/'
  },
  {
    id: '6',
    title: 'HumanVAD',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1589254065878-42c9da997008?auto=format&fit=crop&q=80&w=1200',
    description: 'Production-ready German Voice Activity Detection with 96.7% accuracy. Semantic turn-end detection at 0.077ms latency (130x faster than real-time). Powers conversational AI systems.',
    technologies: ['Python', 'NumPy', 'SciPy', 'ONNX', 'Semantic Analysis', 'Prosody'],
    year: '2025',
    client: 'Voice AI Platform',
    gallery: [
      'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/humanvad/'
  },
  {
    id: '7',
    title: 'Fitness First Tirana',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?auto=format&fit=crop&q=80&w=1200',
    description: 'Modern fitness platform with multilingual support (Albanian/English), workout tracking with Recharts visualizations, class scheduling, and membership management. Responsive React 19 design.',
    technologies: ['React 19', 'Vite', 'i18next', 'Recharts', 'React Hook Form', 'Zod'],
    year: '2025',
    client: 'Fitness First Tirana',
    gallery: [
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://fitnessfirsttirana.com'
  },
  {
    id: '8',
    title: 'Multi-Agent System',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=1200',
    description: 'Multi-agent website generation with specialized agents (design, dev, content, QA) coordinating via RabbitMQ. Generates complete frontend/backend with GitHub Pages deployment.',
    technologies: ['Python', 'Flask', 'RabbitMQ', 'Docker', 'GitHub API', 'AI Agents'],
    year: '2025',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/multi-agent-system/'
  },
  {
    id: '9',
    title: 'NOVA Wallet',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1639762681485-074b7f938ba0?auto=format&fit=crop&q=80&w=1200',
    description: 'Multi-chain cryptocurrency wallet supporting Ethereum, Polygon, BSC, Avalanche, and Solana. Secure AES-GCM encryption with BIP39/BIP44 standards and Chrome extension.',
    technologies: ['React Native', 'Chrome Extension', 'AES-GCM', 'PBKDF2', 'BIP39', 'Web3'],
    year: '2025',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1622630998477-20aa696ecb05?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/NOVA/'
  },
  {
    id: '11',
    title: 'Socrates AI',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200',
    description: 'AI Studio application powered by Google Gemini API. Local development environment with seamless AI Studio deployment for conversational AI and content generation.',
    technologies: ['Node.js', 'Gemini API', 'TypeScript', 'AI Studio', 'REST API'],
    year: '2025',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1676299081847-824916de030a?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1675557009875-436f7a5a4d7f?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/socrates-ai/'
  },
  {
    id: '12',
    title: 'Tyre Hero',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=1200',
    description: 'Mobile-responsive website for emergency roadside tyre fitting and repair service. 60-minute response guarantee with booking system and location-based service areas.',
    technologies: ['React.js', 'Tailwind CSS', 'CRACO', 'GitHub Pages', 'Responsive Design'],
    year: '2025',
    client: 'Tyre Hero UK',
    gallery: [
      'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1489824904134-891ab64532f1?auto=format&fit=crop&q=80&w=1200'
    ],
    githubUrl: 'https://github.com/ezekaj/tyre-hero',
    liveUrl: 'https://tyrehero.uk'
  },
  {
    id: '13',
    title: 'Ultimate Trading Bot',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?auto=format&fit=crop&q=80&w=1200',
    description: 'AI-powered trading platform for forex, stocks, and crypto. Multi-agent decision making with real-time dashboards, backtesting, and Kelly Criterion risk management.',
    technologies: ['Python', 'FastAPI', 'React', 'PostgreSQL', 'Redis', 'Gemini 3.0', 'MT5'],
    year: '2026',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1590283603385-17ffb3a7f29f?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1642790551116-18e150f248e3?auto=format&fit=crop&q=80&w=1200'
    ],
    githubUrl: 'https://github.com/ezekaj/forex_2026',
    liveUrl: 'https://ezekaj.github.io/forex_2026/'
  },
  {
    id: '14',
    title: 'Autonomous Desktop AI',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1550751827-4bd374c3f58b?auto=format&fit=crop&q=80&w=1200',
    description: 'AGI-ready autonomous system with full desktop control, browser automation via Playwright, and real-time YOLO computer vision. Docker containerized with VNC streaming.',
    technologies: ['Python', 'Docker', 'YOLO', 'Playwright', 'X11/VNC', 'Kubernetes'],
    year: '2025',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1526374965328-7f61d4dc18c5?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/autonomus_elo2.0/'
  },
  {
    id: '15',
    title: 'Human Cognition AI',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1559757175-5700dde675bc?auto=format&fit=crop&q=80&w=1200',
    description: 'Neuroscience-based cognitive architecture implementing dual-process systems, theory of mind, emotional processing, and cognitive mapping inspired by human brain research.',
    technologies: ['Python', 'NumPy', 'Numba', 'Neuroscience', 'ML', 'Cognitive Science'],
    year: '2026',
    client: 'Research Project',
    gallery: [
      'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1453847668862-487637052f8a?auto=format&fit=crop&q=80&w=1200'
    ],
    githubUrl: 'https://github.com/ezekaj/agielo',
    liveUrl: 'https://ezekaj.github.io/agielo/'
  },
  {
    id: '16',
    title: 'NEURO VS Code',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=1200',
    description: 'Local AI coding assistant VS Code extension. Zero cloud dependency, learns from your codebase. Intelligent explanations, bug fixes, test generation, and refactoring.',
    technologies: ['TypeScript', 'VS Code API', 'Ollama', 'Local LLMs', 'Mistral'],
    year: '2026',
    client: 'Developer Tools',
    gallery: [
      'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1516116216624-53e697fedbea?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/neuro-vscode/'
  },
  {
    id: '18',
    title: 'FZ Construction',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1504307651254-35680f356dfd?auto=format&fit=crop&q=80&w=1200',
    description: 'Real estate company website with agent portal, property management, and role-based access control. Full-stack platform with JWT authentication and admin dashboard.',
    technologies: ['Node.js', 'Express', 'JWT', 'HTML5', 'CSS3', 'JavaScript'],
    year: '2025',
    client: 'FZ Construction',
    gallery: [
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/fzconstruction-web/'
  },
  {
    id: '19',
    title: 'Spahiu Elektrik',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1621905251189-08b45d6a269e?auto=format&fit=crop&q=80&w=1200',
    description: 'Modern business website for electrical services company with AI-powered chat assistant using Google Gemini. Clean React frontend with TypeScript and dynamic routing.',
    technologies: ['React', 'TypeScript', 'Vite', 'Google Gemini', 'React Router', 'Lucide'],
    year: '2025',
    client: 'Spahiu Elektrik',
    gallery: [
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/spahiu-elektrik-web/'
  },
  {
    id: '20',
    title: 'AADF Procurement Platform',
    category: 'Web',
    featured: true,
    image: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&q=80&w=1200',
    description: 'Enterprise procurement platform for Albanian-American Development Foundation. AI-powered proposal analysis, vendor matching, and evaluation scoring. Built at Junction Tirana Hackathon.',
    technologies: ['Next.js', 'React', 'TailwindCSS', 'Context API', 'AI Analysis'],
    year: '2023',
    client: 'AADF',
    gallery: [
      'https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&q=80&w=1200'
    ],
    githubUrl: 'https://github.com/ezekaj/hackathon1_aadf',
    liveUrl: 'https://ezekaj.github.io/aadf-procurement-web/'
  },
  {
    id: '23',
    title: 'Rregullo Tiranen',
    category: 'Web',
    image: 'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?auto=format&fit=crop&q=80&w=1200',
    description: 'Civic engagement platform for reporting city problems in Tirana. Interactive maps with Leaflet.js, geolocation-based issue reporting, offline PWA functionality, and feedback system.',
    technologies: ['HTML5', 'CSS3', 'JavaScript', 'Leaflet.js', 'PWA', 'Service Workers'],
    year: '2025',
    client: 'Tirana Civic Initiative',
    gallery: [
      'https://images.unsplash.com/photo-1517732306149-e8f829eb588a?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?auto=format&fit=crop&q=80&w=1200'
    ],
    githubUrl: 'https://github.com/ezekaj/Rregullo_Tiranen',
    liveUrl: 'https://ezekaj.github.io/rregullo-tiranen-web/'
  },
  {
    id: '24',
    title: 'Besa AI Assistant',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1531746790095-e5e8ef5041e0?auto=format&fit=crop&q=80&w=1200',
    description: 'AI-powered customer service chatbot for Albanian businesses. Google Gemini integration with secure server-side API architecture deployed on Fly.io.',
    technologies: ['Vite', 'React 19', 'Google Gemini', 'Fly.io', 'Express'],
    year: '2025',
    client: 'ONE / Besa Initiative',
    gallery: [
      'https://images.unsplash.com/photo-1677442136019-21780ecad995?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1676299081847-824916de030a?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/besa-ai-web/'
  },
  {
    id: '25',
    title: 'Kejsi AI Sales Dialer',
    category: 'AI',
    featured: true,
    image: 'https://images.unsplash.com/photo-1556745757-8d76bdb6984b?auto=format&fit=crop&q=80&w=1200',
    description: 'AI-powered sales dialer with ML optimization for the Albanian market. Bayesian optimization, Thompson Sampling, Albanian dialect support (Gheg/Tosk), and smart lead scoring.',
    technologies: ['React', 'TypeScript', 'Node.js', 'Prisma', 'PostgreSQL', 'ML/Bayesian'],
    year: '2025',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1596524430615-b46475ddff6e?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1553877522-43269d4ea984?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/kejsi-dialer-web/'
  },
  {
    id: '27',
    title: 'CodeBluff',
    category: 'AI',
    featured: true,
    image: 'https://images.unsplash.com/photo-1542831371-29b0f74f9713?auto=format&fit=crop&q=80&w=1200',
    description: 'Privacy-first open-source code assistant with AST parsing via Tree-sitter, SQLite knowledge graphs, and local LLM processing. Supports JS, TS, Python, Java, C/C++.',
    technologies: ['Node.js', 'TypeScript', 'Tree-sitter', 'SQLite', 'Ollama', 'ONNX'],
    year: '2025',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1461749280684-dccba630e2f6?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/codebluff-web/'
  },
  {
    id: '28',
    title: 'WP Voice Agent',
    category: 'AI',
    image: 'https://images.unsplash.com/photo-1590602847861-f357a9332bbc?auto=format&fit=crop&q=80&w=1200',
    description: 'Generic framework for integrating voice AI agents into WordPress. Real-time voice streaming via Socket.IO, VAD, and works with any LLM (GPT-4, Claude, Gemini).',
    technologies: ['Node.js', 'Express', 'Socket.IO', 'React', 'Google Cloud STT/TTS', 'WordPress'],
    year: '2025',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1478737270239-2f02b77fc618?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1596524430615-b46475ddff6e?auto=format&fit=crop&q=80&w=1200'
    ],
    liveUrl: 'https://ezekaj.github.io/wp-voice-agent-web/'
  },
  {
    id: '29',
    title: 'Molts Cloud',
    category: 'Web',
    featured: true,
    image: 'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200',
    description: 'B2B SaaS platform for deploying AI chatbot assistants to Telegram, Discord, Slack, Signal in under 1 minute. GDPR-compliant, EU-hosted on Hetzner, with Stripe billing and AES-256 encryption.',
    technologies: ['Next.js 15', 'Fastify', 'PostgreSQL', 'Redis', 'BullMQ', 'Docker', 'Stripe'],
    year: '2026',
    client: 'Z.E Digital Tech',
    gallery: [
      'https://images.unsplash.com/photo-1558494949-ef010cbdcc31?auto=format&fit=crop&q=80&w=1200',
      'https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&q=80&w=1200'
    ],
  }
];

export const SERVICE_ICONS: Record<string, React.ReactNode> = {
  Code: <Code className="w-5 h-5" />,
  Brain: <Brain className="w-5 h-5" />,
  Server: <Server className="w-5 h-5" />,
  Shield: <Shield className="w-5 h-5" />,
  Terminal: <Terminal className="w-5 h-5" />,
  Layers: <Layers className="w-5 h-5" />,
  Database: <Database className="w-5 h-5" />,
  Figma: <Figma className="w-5 h-5" />,
  Zap: <Zap className="w-5 h-5" />
};
