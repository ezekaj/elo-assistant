import React, { useState, useCallback } from 'react';
import { Send, CheckCircle, AlertCircle, RefreshCw, Github, Linkedin, Twitter } from 'lucide-react';
import emailjs from '@emailjs/browser';
import { SERVICES } from '../constants';

const EMAILJS_SERVICE_ID = 'service_permbcj';
const EMAILJS_TEMPLATE_ID = 'template_bqpgg0f';
const EMAILJS_PUBLIC_KEY = '42n0yt2zg1-x6TNDT';

interface FormState {
  name: string;
  email: string;
  service: string;
  message: string;
}

interface ValidationErrors {
  name?: string;
  email?: string;
  service?: string;
  message?: string;
}

type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';

const SOCIAL_LINKS = [
  { name: 'GitHub', icon: Github, url: 'https://github.com/ezekaj' },
  { name: 'LinkedIn', icon: Linkedin, url: 'https://linkedin.com/company/zedigitaltech' },
  { name: 'Twitter', icon: Twitter, url: 'https://twitter.com/zedigitaltech' },
];

const ContactCard: React.FC = () => {
  const [formState, setFormState] = useState<FormState>({ name: '', email: '', service: '', message: '' });
  const [focused, setFocused] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<ValidationErrors>({});
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
  const [submissionError, setSubmissionError] = useState('');

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  const validateField = useCallback((field: keyof FormState, value: string): string | undefined => {
    switch (field) {
      case 'name': return !value.trim() ? 'Required' : value.trim().length < 2 ? 'Min 2 chars' : undefined;
      case 'email': return !value.trim() ? 'Required' : !emailRegex.test(value) ? 'Invalid email' : undefined;
      case 'service': return !value ? 'Select service' : undefined;
      case 'message': return !value.trim() ? 'Required' : value.trim().length < 10 ? 'Min 10 chars' : undefined;
    }
  }, []);

  const handleBlur = (field: keyof FormState) => {
    setFocused(null);
    setTouched(prev => ({ ...prev, [field]: true }));
    const error = validateField(field, formState[field]);
    setErrors(prev => ({ ...prev, [field]: error }));
  };

  const handleChange = (field: keyof FormState, value: string) => {
    setFormState(s => ({ ...s, [field]: value }));
    if (touched[field]) {
      const error = validateField(field, value);
      setErrors(prev => ({ ...prev, [field]: error }));
    }
    if (submissionStatus === 'error') {
      setSubmissionStatus('idle');
      setSubmissionError('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const allTouched = { name: true, email: true, service: true, message: true };
    setTouched(allTouched);

    const newErrors: ValidationErrors = {};
    (Object.keys(formState) as Array<keyof FormState>).forEach(field => {
      const error = validateField(field, formState[field]);
      if (error) newErrors[field] = error;
    });
    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    setSubmissionStatus('submitting');
    try {
      const serviceLabel = SERVICES.find(s => s.id === formState.service)?.title || formState.service;
      await emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, {
        to_email: 'contact@zedigital.tech',
        from_name: formState.name,
        from_email: formState.email,
        reply_to: formState.email,
        service_type: serviceLabel,
        message: formState.message,
      }, EMAILJS_PUBLIC_KEY);

      setSubmissionStatus('success');
      setFormState({ name: '', email: '', service: '', message: '' });
      setTouched({});
    } catch (error) {
      setSubmissionStatus('error');
      setSubmissionError(error instanceof Error ? error.message : 'Failed to send. Try again.');
    }
  };

  const isSubmitting = submissionStatus === 'submitting';

  const inputClass = (field: keyof FormState) =>
    `brutal-input brutal-select ${errors[field] && touched[field] ? 'error' : ''} ${focused === field ? 'focused' : ''}`;

  return (
    <div className="card card-wide">
      {/* Card header */}
      <div className="card-header">
        <span className="card-id">CONTACT</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="font-code" style={{ fontSize: '0.6rem', color: submissionStatus === 'success' ? '#00ff88' : submissionStatus === 'error' ? 'var(--accent)' : 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>
            {submissionStatus === 'success' ? 'Transmitted' : submissionStatus === 'error' ? 'Error' : submissionStatus === 'submitting' ? 'Sending...' : 'Ready'}
          </span>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: submissionStatus === 'success' ? '#00ff88' : submissionStatus === 'error' ? 'var(--accent)' : '#00ff88' }} />
        </div>
      </div>

      <h2>Get in Touch</h2>

      <div className="card-body" style={{ overflow: 'visible' }}>
        {submissionStatus === 'success' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <CheckCircle style={{ width: 32, height: 32, color: '#00ff88', margin: '0 auto 12px' }} />
            <p style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '8px' }}>Message Sent</p>
            <p style={{ marginBottom: '16px' }}>We'll respond within 24 hours.</p>
            <button className="brutal-btn-cyan brutal-btn" onClick={() => setSubmissionStatus('idle')} style={{ margin: '0 auto' }}>
              Send Another
            </button>
          </div>
        ) : submissionStatus === 'error' ? (
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <AlertCircle style={{ width: 32, height: 32, color: 'var(--accent)', margin: '0 auto 12px' }} />
            <p style={{ color: '#fff', fontSize: '0.85rem', marginBottom: '8px' }}>Failed to Send</p>
            <p style={{ marginBottom: '16px' }}>{submissionError}</p>
            <button className="brutal-btn" onClick={() => { setSubmissionStatus('idle'); setSubmissionError(''); }} style={{ margin: '0 auto' }}>
              <RefreshCw style={{ width: 12, height: 12 }} /> Try Again
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              <div>
                <input
                  type="text"
                  placeholder="Name *"
                  value={formState.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  onFocus={() => setFocused('name')}
                  onBlur={() => handleBlur('name')}
                  disabled={isSubmitting}
                  className={inputClass('name')}
                />
                {errors.name && touched.name && (
                  <span style={{ color: 'var(--accent)', fontSize: '0.6rem', fontFamily: 'var(--font-code)' }}>{errors.name}</span>
                )}
              </div>
              <div>
                <input
                  type="email"
                  placeholder="Email *"
                  value={formState.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  onFocus={() => setFocused('email')}
                  onBlur={() => handleBlur('email')}
                  disabled={isSubmitting}
                  className={inputClass('email')}
                />
                {errors.email && touched.email && (
                  <span style={{ color: 'var(--accent)', fontSize: '0.6rem', fontFamily: 'var(--font-code)' }}>{errors.email}</span>
                )}
              </div>
            </div>

            <div>
              <select
                value={formState.service}
                onChange={(e) => handleChange('service', e.target.value)}
                onFocus={() => setFocused('service')}
                onBlur={() => handleBlur('service')}
                disabled={isSubmitting}
                className={`${inputClass('service')} brutal-select`}
              >
                <option value="">Select Service *</option>
                {SERVICES.map(s => (
                  <option key={s.id} value={s.id} style={{ background: '#0a0a0a' }}>{s.title}</option>
                ))}
              </select>
              {errors.service && touched.service && (
                <span style={{ color: 'var(--accent)', fontSize: '0.6rem', fontFamily: 'var(--font-code)' }}>{errors.service}</span>
              )}
            </div>

            <div>
              <textarea
                placeholder="Message *"
                value={formState.message}
                onChange={(e) => handleChange('message', e.target.value)}
                onFocus={() => setFocused('message')}
                onBlur={() => handleBlur('message')}
                rows={3}
                disabled={isSubmitting}
                className={inputClass('message')}
                style={{ resize: 'none' }}
              />
              {errors.message && touched.message && (
                <span style={{ color: 'var(--accent)', fontSize: '0.6rem', fontFamily: 'var(--font-code)' }}>{errors.message}</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="font-code" style={{ fontSize: '0.6rem', color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase' }}>
                {formState.message.length}/500
              </span>
              <button type="submit" disabled={isSubmitting} className="brutal-btn">
                {isSubmitting ? 'Sending...' : 'Send'}
                <Send style={{ width: 12, height: 12 }} />
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Social links footer */}
      <div className="card-footer">
        {SOCIAL_LINKS.map(social => (
          <a
            key={social.name}
            href={social.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: 'rgba(255,255,255,0.4)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.6rem' }}
          >
            <social.icon style={{ width: 10, height: 10 }} />
            {social.name}
          </a>
        ))}
      </div>
    </div>
  );
};

export default ContactCard;
