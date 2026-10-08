"""Local company operations; credentials are displayed only when issued."""

from __future__ import annotations

import argparse
import getpass
import json
import logging

from control_plane.accounts import Accounts
from control_plane.domain import ControlPlaneStore
from control_plane.persistence import SQLiteRepository
from control_plane.settings import Settings


def main():
    logging.basicConfig(level=logging.WARNING, format="%(asctime)s %(levelname)s %(message)s")
    parser = argparse.ArgumentParser(description="Cleany company account management")
    parser.add_argument("--database", default=Settings().database_path)
    commands = parser.add_subparsers(dest="command", required=True)
    customer = commands.add_parser("customer-create")
    customer.add_argument("name")
    site = commands.add_parser("site-create")
    site.add_argument("customer_id")
    site.add_argument("name")
    site.add_argument("--map-ref", default="facility-18f")
    create = commands.add_parser("account-create")
    create.add_argument("customer_id")
    create.add_argument("login_id")
    create.add_argument("name")
    for command in ("reset-password", "disable", "reactivate"):
        commands.add_parser(command).add_argument("user_id")
    robot = commands.add_parser("robot-register")
    robot.add_argument("customer_id")
    robot.add_argument("site_id")
    adopt = commands.add_parser("adopt-legacy")
    adopt.add_argument("customer_id")
    adopt.add_argument("site_id")
    args = parser.parse_args()
    repo = SQLiteRepository(args.database)
    store = ControlPlaneStore(repo)
    accounts = Accounts(store, Settings())
    try:
        if args.command == "customer-create":
            result = {"customer_id": accounts.create_customer(args.name)}
        elif args.command == "site-create":
            result = {"site_id": accounts.create_site(args.customer_id, args.name, args.map_ref)}
        elif args.command == "account-create":
            user_id, password = accounts.provision(args.customer_id, args.login_id, args.name)
            result = {
                "user_id": user_id,
                "login_id": args.login_id.strip().lower(),
                "temporary_password": password,
            }
        elif args.command == "robot-register":
            result = {
                "robot_id": "cleany-01",
                "token": accounts.register_robot(args.customer_id, args.site_id),
            }
        elif args.command == "adopt-legacy":
            with store.transaction():
                if (
                    store.robot.active_mission_id
                    or repo.connection.execute("SELECT 1 FROM missions WHERE active=1").fetchone()
                ):
                    raise ValueError("unresolved mission; do not adopt ownership")
                count = repo.connection.execute(
                    "UPDATE missions SET customer_id=?,site_id=? WHERE customer_id IS NULL",
                    (args.customer_id, args.site_id),
                ).rowcount
            result = {"adopted_legacy_missions": count}
        elif args.command == "disable":
            accounts.disable(args.user_id)
            result = {"disabled": args.user_id}
        else:
            result = {
                "user_id": args.user_id,
                "temporary_password": accounts.reset(
                    args.user_id, reactivate=args.command == "reactivate"
                ),
            }
        logging.warning(
            "admin actor=%s command=%s target=%s",
            getpass.getuser(),
            args.command,
            getattr(args, "user_id", getattr(args, "customer_id", "new")),
        )
        print(json.dumps(result, ensure_ascii=False))
    finally:
        repo.close()


if __name__ == "__main__":
    main()
