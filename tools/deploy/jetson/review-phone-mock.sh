#!/usr/bin/env bash
# Isolated HTTP integration fixture: --mock never initializes ROS or motor transport.
set -e
source /opt/ros/humble/setup.bash
review_root="$HOME/.cache/cleany-manual-review"
export AMENT_PREFIX_PATH="$review_root/prefix:$AMENT_PREFIX_PATH"
export PYTHONPATH="$HOME/cleany-worktrees/control-plane-integration/ros2_ws/src/cleany_teleop:$PYTHONPATH"
exec python3 -m cleany_teleop.web --mock --host 127.0.0.1 --port 18766 \
  --max-speed 2 --token-file "$review_root/token" --event-log "$review_root/events.jsonl"
