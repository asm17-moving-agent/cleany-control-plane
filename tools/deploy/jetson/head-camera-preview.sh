#!/bin/bash
set -e
source /opt/ros/humble/setup.bash
source "${CLEANY_TELEMETRY_INSTALL:-$HOME/cleany-data/builds/cleany/install}/setup.bash"
exec ros2 run cleany_telemetry camera_preview --ros-args -p allowed_topic:=/camera/head/color/image_redacted -p host:=127.0.0.1 -p port:=8769
