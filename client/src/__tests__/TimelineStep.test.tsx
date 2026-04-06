import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import TimelineStep from '../components/roadmap/TimelineStep.jsx';
import type { StepWithStatus } from '../types/api.js';

vi.mock('../components/roadmap/DeadlineCountdown.jsx', () => ({
  default: () => null,
}));

function makeStep(overrides: Partial<StepWithStatus> = {}): StepWithStatus {
  return {
    id: 1,
    title: 'Submit Application',
    description: 'Fill out the application form',
    icon: '',
    sort_order: 1,
    is_public: 0,
    is_optional: 0,
    deadline: null,
    deadline_date: null,
    links: null,
    guide_content: null,
    contact_info: null,
    required_tags: null,
    excluded_tags: null,
    required_tag_mode: null,
    link_url: null,
    link_label: null,
    category: null,
    api_check_type: null,
    status: 'not_started',
    ...overrides,
  };
}

describe('TimelineStep', () => {
  const defaultProps = {
    index: 0,
    totalSteps: 5,
    isSelected: false,
    isPreview: false,
    isLast: false,
    onClick: vi.fn(),
    onSelect: vi.fn(),
  };

  it('renders step title', () => {
    render(<TimelineStep step={makeStep()} {...defaultProps} />);
    expect(screen.getByText('Submit Application')).toBeDefined();
  });

  it('shows Completed badge for completed status', () => {
    render(<TimelineStep step={makeStep({ status: 'completed' })} {...defaultProps} />);
    expect(screen.getByText('Completed')).toBeDefined();
  });

  it('shows In Progress badge for in_progress status', () => {
    render(<TimelineStep step={makeStep({ status: 'in_progress' })} {...defaultProps} />);
    expect(screen.getByText('In Progress')).toBeDefined();
  });

  it('shows Waived badge for waived status', () => {
    render(<TimelineStep step={makeStep({ status: 'waived' })} {...defaultProps} />);
    expect(screen.getByText('Waived')).toBeDefined();
  });

  it('shows Not Started badge for not_started status', () => {
    render(<TimelineStep step={makeStep({ status: 'not_started' })} {...defaultProps} />);
    expect(screen.getByText('Not Started')).toBeDefined();
  });
});
