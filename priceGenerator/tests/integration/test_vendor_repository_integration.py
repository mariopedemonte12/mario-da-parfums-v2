"""Integration tests for VendorRepository against a real Postgres instance.

Run with `pytest -m integration`. Covers the two scenarios that only show up
against a real unique constraint: ensure_vendors() being truly idempotent,
and never overwriting a website_url an admin edited by hand after the first
run (spec: "Vendors falsos").
"""

import pytest

from priceGenerator.models import FakeVendor
from priceGenerator.vendor_repository import VendorRepository

pytestmark = pytest.mark.integration


def test_ensure_vendors_inserts_new_vendors(db_connection, vendor_name_cleanup, unique_suffix):
    repo = VendorRepository(db_connection)
    vendors = [
        FakeVendor(name=f"ZZTEST Vendor A {unique_suffix}", website_url="https://a.example.com"),
        FakeVendor(name=f"ZZTEST Vendor B {unique_suffix}", website_url="https://b.example.com"),
    ]
    vendor_name_cleanup.extend(v.name for v in vendors)

    inserted = repo.ensure_vendors(vendors)

    assert inserted == 2
    names = {v.name for v in repo.list_all()}
    assert vendors[0].name in names
    assert vendors[1].name in names


def test_ensure_vendors_is_idempotent_no_duplicate_rows(db_connection, vendor_name_cleanup, unique_suffix):
    repo = VendorRepository(db_connection)
    vendor = FakeVendor(name=f"ZZTEST Vendor Dup {unique_suffix}", website_url="https://dup.example.com")
    vendor_name_cleanup.append(vendor.name)

    first_run_inserted = repo.ensure_vendors([vendor])
    second_run_inserted = repo.ensure_vendors([vendor])

    assert first_run_inserted == 1
    assert second_run_inserted == 0
    with db_connection.cursor() as cursor:
        cursor.execute("SELECT count(*) FROM vendors WHERE name = %s", (vendor.name,))
        (count,) = cursor.fetchone()
    assert count == 1


def test_ensure_vendors_does_not_overwrite_a_manually_edited_website_url(
    db_connection, vendor_name_cleanup, unique_suffix
):
    repo = VendorRepository(db_connection)
    vendor = FakeVendor(
        name=f"ZZTEST Vendor Edited {unique_suffix}",
        website_url="https://original.example.com",
    )
    vendor_name_cleanup.append(vendor.name)

    repo.ensure_vendors([vendor])

    edited_url = "https://manually-edited-by-admin.example.com"
    with db_connection.cursor() as cursor:
        cursor.execute("UPDATE vendors SET website_url = %s WHERE name = %s", (edited_url, vendor.name))
    db_connection.commit()

    repo.ensure_vendors([vendor])  # run again with the *original* url

    with db_connection.cursor() as cursor:
        cursor.execute("SELECT website_url FROM vendors WHERE name = %s", (vendor.name,))
        (website_url,) = cursor.fetchone()
    assert website_url == edited_url


def test_list_all_returns_every_vendor_not_only_fake_ones(db_connection, vendor_factory, unique_suffix):
    extra_vendor_id = vendor_factory(f"ZZTEST Extra Vendor Not In Fake List {unique_suffix}")
    repo = VendorRepository(db_connection)

    all_vendors = repo.list_all()

    assert any(v.id == extra_vendor_id for v in all_vendors)
