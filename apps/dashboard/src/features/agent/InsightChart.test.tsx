// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { components } from '../../api/generated/openapi';
import { InsightChart } from './InsightChart';

const review: components['schemas']['AgentInsight'] = {
  kind: 'review_progress', site_id: 'site', captured_at: '2026-11-21T18:00:00+09:00',
  start_day: '2026-11-21', end_day: '2026-11-21', scope_label: '시설 전체',
  basis: '검토 대상 3건', metric: '검토 완료', unit: '건', value: 0, sample_count: 3,
  buckets: [{label:'검토 완료',value:0},{label:'검토 대기',value:3}], sources:['모의'],
};

describe('operational chart denominators', () => {
  it('distinguishes no eligible work from zero reviewed out of three', () => {
    const { rerender } = render(<InsightChart card={{...review, sample_count:0, basis:'검토 대상 0건', buckets:[]}} />);
    expect(screen.getByText('검토 대상 작업이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByText('0%')).not.toBeInTheDocument();
    rerender(<InsightChart card={review} />);
    expect(screen.getByText('0 / 3건 검토 완료')).toBeInTheDocument();
    expect(screen.getByText('확인할 작업 3건')).toBeInTheDocument();
  });
  it('computes area coverage against registered seats even when only one area has records', () => {
    render(<InsightChart card={{...review,kind:'zone_coverage',buckets:[{label:'D-HUB',value:2,capacity:48},{label:'SPACE-M1',value:0,capacity:6}]}} />);
    expect(screen.getByText('4% · 2/48석')).toBeInTheDocument();
    expect(screen.getByText('0% · 0/6석')).toBeInTheDocument();
  });
});
