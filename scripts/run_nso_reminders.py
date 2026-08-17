#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
from pathlib import Path

from nso_reminders.config import load_nso_config
from nso_reminders.pipeline import run_dry_run


def main() -> None:
    parser = argparse.ArgumentParser(description="NSO First Tamper Check reminders")
    parser.add_argument("--dry-run", action="store_true", required=True)
    parser.add_argument("--grid", type=Path, required=True)
    parser.add_argument("--send-log", type=Path, required=True)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--config", type=Path, default=None)
    args = parser.parse_args()

    config = load_nso_config(args.config) if args.config else load_nso_config()
    summary = run_dry_run(
        grid_path=args.grid,
        send_log_path=args.send_log,
        cache_path=args.cache,
        out_dir=args.out,
        config=config,
    )
    print(
        json.dumps(
            {
                "report_path": str(summary["report_path"]),
                "draft_count": len(summary["draft_previews"]),
                "decision_count": len(summary["decisions"]),
                "actions": {
                    d["newco_id"]: d["action"] for d in summary["decisions"]
                },
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
