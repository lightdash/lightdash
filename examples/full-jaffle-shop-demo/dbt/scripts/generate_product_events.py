#!/usr/bin/env python3
"""
Generate product events seed data with realistic user journeys.
Users progress through funnel stages with drop-off at each step.
"""

import csv
import json
import random
from datetime import datetime, timedelta
from pathlib import Path

# Configuration
NUM_SESSIONS = 10000  # Number of user sessions to generate
NUM_USERS = 5000  # Realistic user base
END_DATE = datetime.now()
START_DATE = END_DATE - timedelta(days=30)
OUTPUT_FILE = Path(__file__).parent.parent / "data" / "raw_product_events.csv"

# Funnel stages in order - users progress through these sequentially
FUNNEL_STAGES = [
    "page_view",
    "product_viewed",
    "add_to_cart",
    "checkout_started",
    "payment_info_entered",
    "checkout_completed",
]

# Probability of progressing to the next stage (realistic e-commerce drop-off)
STAGE_PROGRESSION_RATES = {
    "page_view": 0.45,           # 45% view a product
    "product_viewed": 0.25,      # 25% add to cart
    "add_to_cart": 0.40,         # 40% start checkout
    "checkout_started": 0.65,    # 65% enter payment info
    "payment_info_entered": 0.80, # 80% complete checkout
}

# How many page views before product view (realistic browsing)
PAGE_VIEWS_BEFORE_PRODUCT = (1, 5)

DEVICES = ["desktop", "mobile", "tablet"]
DEVICE_WEIGHTS = [50, 40, 10]

BROWSERS = ["Chrome", "Safari", "Firefox", "Edge", "Other"]
BROWSER_WEIGHTS = [55, 25, 10, 7, 3]

REFERRERS = ["direct", "google", "facebook", "instagram", "twitter", "email", "affiliate"]
REFERRER_WEIGHTS = [30, 35, 15, 8, 5, 5, 2]

PAGES = [
    "/",
    "/products",
    "/products/coffee-beans",
    "/products/coffee-maker",
    "/products/grinder",
    "/products/accessories",
    "/about",
    "/contact",
]

PRODUCTS = [
    {"id": "prod_001", "name": "Ethiopian Coffee Beans", "category": "beans", "price": 24.99},
    {"id": "prod_002", "name": "Colombian Coffee Beans", "category": "beans", "price": 22.99},
    {"id": "prod_003", "name": "Espresso Machine Pro", "category": "machines", "price": 299.99},
    {"id": "prod_004", "name": "Drip Coffee Maker", "category": "machines", "price": 89.99},
    {"id": "prod_005", "name": "Burr Grinder", "category": "grinders", "price": 149.99},
    {"id": "prod_006", "name": "Manual Grinder", "category": "grinders", "price": 39.99},
    {"id": "prod_007", "name": "Travel Mug", "category": "accessories", "price": 19.99},
    {"id": "prod_008", "name": "Coffee Filters (100pk)", "category": "accessories", "price": 9.99},
]


def weighted_choice(items, weights):
    return random.choices(items, weights=weights, k=1)[0]


def generate_session_id():
    return f"sess_{random.randint(100000000, 999999999)}"


def generate_event_properties(event_type: str, session_context: dict) -> dict:
    """Generate event-specific properties using session context."""
    props = {}

    if event_type == "page_view":
        props["page_url"] = random.choice(PAGES)
        props["time_on_page_seconds"] = random.randint(5, 300)

    elif event_type == "product_viewed":
        product = session_context.get("product") or random.choice(PRODUCTS)
        session_context["product"] = product  # Store for later events
        props["product_id"] = product["id"]
        props["product_name"] = product["name"]
        props["product_category"] = product["category"]
        props["product_price"] = product["price"]
        props["view_duration_seconds"] = random.randint(10, 180)

    elif event_type == "add_to_cart":
        product = session_context.get("product", random.choice(PRODUCTS))
        quantity = random.choices([1, 2, 3, 4, 5], weights=[60, 25, 10, 3, 2])[0]
        session_context["quantity"] = quantity
        session_context["cart_total"] = round(product["price"] * quantity, 2)
        props["product_id"] = product["id"]
        props["product_name"] = product["name"]
        props["product_price"] = product["price"]
        props["quantity"] = quantity
        props["cart_total"] = session_context["cart_total"]

    elif event_type == "checkout_started":
        props["cart_item_count"] = session_context.get("quantity", 1)
        props["cart_total"] = session_context.get("cart_total", 50.00)

    elif event_type == "payment_info_entered":
        payment_method = random.choice(["credit_card", "paypal", "apple_pay", "google_pay"])
        session_context["payment_method"] = payment_method
        props["payment_method"] = payment_method

    elif event_type == "checkout_completed":
        props["order_total"] = session_context.get("cart_total", 50.00)
        props["item_count"] = session_context.get("quantity", 1)
        props["payment_method"] = session_context.get("payment_method", "credit_card")
        props["shipping_method"] = random.choice(["standard", "express", "overnight"])

    return props


def generate_session(user_id: int, session_start: datetime) -> list:
    """Generate a realistic user session with funnel progression."""
    events = []
    session_id = generate_session_id()
    device = weighted_choice(DEVICES, DEVICE_WEIGHTS)
    browser = weighted_choice(BROWSERS, BROWSER_WEIGHTS)
    referrer = weighted_choice(REFERRERS, REFERRER_WEIGHTS)

    current_time = session_start
    session_context = {}

    # Generate initial page views (browsing behavior)
    num_page_views = random.randint(*PAGE_VIEWS_BEFORE_PRODUCT)
    for _ in range(num_page_views):
        props = generate_event_properties("page_view", session_context)
        events.append({
            "user_id": user_id,
            "session_id": session_id,
            "event_name": "page_view",
            "event_timestamp": current_time,
            "device_type": device,
            "browser": browser,
            "referrer": referrer,
            "event_properties": props,
        })
        # Time between page views: 10 seconds to 5 minutes
        current_time += timedelta(seconds=random.randint(10, 300))

    # Progress through funnel stages with drop-off
    for i, stage in enumerate(FUNNEL_STAGES):
        if stage == "page_view":
            continue  # Already handled above

        # Check if user progresses to this stage
        prev_stage = FUNNEL_STAGES[i - 1]
        if random.random() > STAGE_PROGRESSION_RATES.get(prev_stage, 0.5):
            break  # User dropped off

        # Time between funnel stages: 30 seconds to 10 minutes
        current_time += timedelta(seconds=random.randint(30, 600))

        props = generate_event_properties(stage, session_context)
        events.append({
            "user_id": user_id,
            "session_id": session_id,
            "event_name": stage,
            "event_timestamp": current_time,
            "device_type": device,
            "browser": browser,
            "referrer": referrer,
            "event_properties": props,
        })

    return events


def generate_all_events():
    """Generate all events from user sessions."""
    print(f"Generating events from {NUM_SESSIONS} sessions...")

    all_events = []
    date_range_seconds = int((END_DATE - START_DATE).total_seconds())

    for session_num in range(NUM_SESSIONS):
        if session_num % 500 == 0:
            print(f"  Generated {session_num} sessions...")

        user_id = random.randint(1, NUM_USERS)
        session_start = START_DATE + timedelta(seconds=random.randint(0, date_range_seconds))

        session_events = generate_session(user_id, session_start)
        all_events.extend(session_events)

    # Sort by timestamp and assign event IDs
    all_events.sort(key=lambda e: e["event_timestamp"])
    for i, event in enumerate(all_events):
        event["event_id"] = i + 1
        event["event_timestamp"] = event["event_timestamp"].strftime("%Y-%m-%d %H:%M:%S")
        event["event_properties"] = json.dumps(event["event_properties"])

    print(f"  Total events generated: {len(all_events)}")
    return all_events


def write_csv(events):
    """Write events to CSV file."""
    print(f"Writing to {OUTPUT_FILE}...")

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)

    fieldnames = [
        "event_id",
        "user_id",
        "session_id",
        "event_name",
        "event_timestamp",
        "device_type",
        "browser",
        "referrer",
        "event_properties",
    ]

    with open(OUTPUT_FILE, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(events)

    print(f"Done! Created {OUTPUT_FILE}")


def print_funnel_stats(events):
    """Print funnel conversion stats."""
    print("\nFunnel stats by session:")

    sessions = {}
    for e in events:
        sid = e["session_id"]
        if sid not in sessions:
            sessions[sid] = set()
        # Parse event_name from the event (it's still the raw value before JSON dump)
        sessions[sid].add(e["event_name"])

    for stage in FUNNEL_STAGES:
        count = sum(1 for s in sessions.values() if stage in s)
        pct = count / len(sessions) * 100
        print(f"  {stage}: {count} sessions ({pct:.1f}%)")


def main():
    random.seed(42)  # For reproducibility
    events = generate_all_events()

    # Print stats before converting to CSV format
    events_for_stats = [
        {**e, "event_name": e["event_name"]}
        for e in events
    ]

    # Temporarily store event_name before JSON conversion for stats
    event_names = {e["session_id"]: set() for e in events}
    for e in events:
        event_names[e["session_id"]].add(e["event_name"])

    print("\nFunnel stats by session:")
    total_sessions = len(event_names)
    for stage in FUNNEL_STAGES:
        count = sum(1 for stages in event_names.values() if stage in stages)
        pct = count / total_sessions * 100
        print(f"  {stage}: {count} sessions ({pct:.1f}%)")

    write_csv(events)


if __name__ == "__main__":
    main()
