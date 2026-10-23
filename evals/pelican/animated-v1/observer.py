def is_primary_completion(event, thread_id, turn_id):
    params = event.get('params', {})
    return (event.get('method') == 'turn/completed'
            and thread_id is not None and turn_id is not None
            and params.get('threadId') == thread_id
            and params.get('turn', {}).get('id') == turn_id)

def budget_exhausted(now, started, tools, protocol):
    return now-started >= protocol["wall_seconds"] or tools >= protocol["max_tool_calls"]
