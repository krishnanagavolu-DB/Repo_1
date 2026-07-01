from pathlib import Path

import pandas as pd


OUTPUT_DIR = Path(".")


def write_csv(filename: str, rows: list[dict[str, str]]) -> None:
    """Write a CSV file in the current folder."""
    path = OUTPUT_DIR / filename
    pd.DataFrame(rows).to_csv(path, index=False)
    print(f"Created {path}")


def main() -> None:
    pwc_rows = [
        {
            "NewCoID": "1001",
            "Merchant_ID": "DB-1001",
            "Terminal_ID": "T-1001-01",
            "Serial_Number": "VFN-1001-A",
            "Status": "Green/Active",
        },
        {
            "NewCoID": "1001",
            "Merchant_ID": "DB-1001",
            "Terminal_ID": "T-1001-02",
            "Serial_Number": "VFN-1001-B",
            "Status": "Green/Active",
        },
        {
            "NewCoID": "1002",
            "Merchant_ID": "DB-1002",
            "Terminal_ID": "T-1002-01",
            "Serial_Number": "VFN-1002-A",
            "Status": "Green/Active",
        },
        {
            "NewCoID": "1002",
            "Merchant_ID": "DB-1002",
            "Terminal_ID": "T-1002-02",
            "Serial_Number": "VFN-1002-B",
            "Status": "Green/Active",
        },
        {
            "NewCoID": "1003",
            "Merchant_ID": "DB-1003",
            "Terminal_ID": "T-1003-01",
            "Serial_Number": "VFN-1003-A",
            "Status": "Green/Active",
        },
        {
            "NewCoID": "1004",
            "Merchant_ID": "DB-1004",
            "Terminal_ID": "T-1004-01",
            "Serial_Number": "VFN-1004-DIGITAL",
            "Status": "Green/Active",
        },
        {
            "NewCoID": "1005",
            "Merchant_ID": "DB-1005",
            "Terminal_ID": "T-1005-01",
            "Serial_Number": "VFN-1005-A",
            "Status": "Red/Inactive",
        },
        {
            "NewCoID": "1006",
            "Merchant_ID": "DB-1006",
            "Terminal_ID": "T-1006-01",
            "Serial_Number": "VFN-1006-A",
            "Status": "Green/Active",
        },
        {
            "NewCoID": "1007",
            "Merchant_ID": "DB-1007",
            "Terminal_ID": "T-1007-01",
            "Serial_Number": "VFN-1007-A",
            "Status": "Green/Active",
        },
    ]

    vhq_rows = [
        {
            "NewCoID": "1001",
            "Serial_Number": "VFN-1001-A",
            "Hierarchy": "Dutch Bros / 1001",
            "Status": "Active",
            "Last_Heartbeat": "2026-06-30 08:15:00",
        },
        {
            "NewCoID": "1001",
            "Serial_Number": "VFN-1001-B",
            "Hierarchy": "Dutch Bros / 1001",
            "Status": "Active",
            "Last_Heartbeat": "2026-06-30 08:16:00",
        },
        {
            "NewCoID": "1002",
            "Serial_Number": "VFN-1002-A",
            "Hierarchy": "Dutch Bros / 1002",
            "Status": "Active",
            "Last_Heartbeat": "2026-06-29 10:01:00",
        },
        {
            "NewCoID": "1003",
            "Serial_Number": "VFN-1003-A",
            "Hierarchy": "Dutch Bros / 1003",
            "Status": "Active",
            "Last_Heartbeat": "2026-06-29 11:20:00",
        },
        {
            "NewCoID": "1003",
            "Serial_Number": "VFN-1003-VHQONLY",
            "Hierarchy": "Dutch Bros / 1003",
            "Status": "Active",
            "Last_Heartbeat": "2026-06-29 11:25:00",
        },
        {
            "NewCoID": "1004",
            "Serial_Number": "VFN-1004-DIGITAL",
            "Hierarchy": "Dutch Bros / 1004",
            "Status": "Active",
            "Last_Heartbeat": "2026-06-28 09:00:00",
        },
        {
            "NewCoID": "1005",
            "Serial_Number": "VFN-1005-A",
            "Hierarchy": "Dutch Bros / 1005",
            "Status": "Active",
            "Last_Heartbeat": "2026-06-27 13:00:00",
        },
        {
            "NewCoID": "1006",
            "Serial_Number": "VFN-1006-A",
            "Hierarchy": "Dutch Bros / 1006",
            "Status": "Pending Registration",
            "Last_Heartbeat": "",
        },
        {
            "NewCoID": "1007",
            "Serial_Number": "VFN-1007-A",
            "Hierarchy": "Dutch Bros / 1007",
            "Status": "Inactive",
            "Last_Heartbeat": "2026-06-20 07:00:00",
        },
    ]

    itrac_rows = [
        {
            "NewCoID": "1001",
            "Shipped_Serial_Number": "VFN-1001-A",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1001",
            "Shipped_Serial_Number": "VFN-1001-B",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1002",
            "Shipped_Serial_Number": "VFN-1002-A",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1002",
            "Shipped_Serial_Number": "VFN-1002-B",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1003",
            "Shipped_Serial_Number": "VFN-1003-A",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1004",
            "Shipped_Serial_Number": "VFN-1004-PHYSICAL",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1005",
            "Shipped_Serial_Number": "VFN-1005-A",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1006",
            "Shipped_Serial_Number": "VFN-1006-A",
            "Shipping_Status": "Delivered",
        },
        {
            "NewCoID": "1007",
            "Shipped_Serial_Number": "VFN-1007-A",
            "Shipping_Status": "Delivered",
        },
    ]

    write_csv("pwc_report.csv", pwc_rows)
    write_csv("vhq_report.csv", vhq_rows)
    write_csv("itrac_report.csv", itrac_rows)
    print("\nMock files are ready. Run: python3 triangle_verification_report.py")


if __name__ == "__main__":
    main()
