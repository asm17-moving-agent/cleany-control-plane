"""Deterministic model boundary for browser tests. Never calls an external provider."""
import asyncio
import json
from datetime import date, timedelta
from control_plane.agent_intents import explicit_view
from control_plane.agent_provider import AgentProviderError


class BrowserAgentProvider:
    async def stream(self, instructions, messages, tools, context=None):
        user = next(m['content'] for m in reversed(messages) if m.get('role') == 'user')
        if user == '연결 오류 테스트':
            raise AgentProviderError('AI 연결 시간이 초과되었습니다. 다시 시도해 주세요.')
        current_output = bool(messages and messages[-1].get('type') == 'function_call_output')
        if not current_output:
            if view := explicit_view(user):
                name, args = 'show_operations_view', {'view': view, 'start_day': None, 'end_day': None}
            elif user == '이 작업 진행 상태를 보여줘':
                name, args = 'get_mission', {'mission_id': context['mission_id']}
            elif user == '어제와 오늘 작업 기록 비교':
                today = date.fromisoformat(context['now'][:10])
                name, args = 'mission_history', {'start_day': (today - timedelta(days=1)).isoformat(), 'end_day': today.isoformat(), 'seat_id': None}
            elif '정리' in user:
                context = json.loads(instructions.split('Current context (JSON):\n')[1].split('\nPlan state')[0])
                name = 'draft_seat_plan'
                args = {'seat_ids': context.get('seat_ids') or ['seat-18'], 'priority': 'NORMAL', 'robot_id': None, 'title': '선택 좌석 정리', 'reason': '관리자 요청'}
            else:
                name, args = 'mission_history', {'start_day': None, 'end_day': None, 'seat_id': None}
            yield {'type': 'done', 'output': [{'type': 'function_call', 'name': name, 'arguments': json.dumps(args), 'call_id': 'browser-call'}]}
        else:
            answer = '계획을 준비했습니다. 승인하면 정리 작업이 요청됩니다.' if '정리' in user else '운영 DB에서 오늘의 작업 기록을 확인했습니다.'
            for word in answer.split():
                await asyncio.sleep(.12 if '느리게' not in user else .7)
                yield {'type': 'delta', 'text': word + ' '}
            yield {'type': 'done', 'output': []}
