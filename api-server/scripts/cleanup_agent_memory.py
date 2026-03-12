"""One-time cleanup: delete all agent-memory.md records from the database.

These were ghost memories written by the now-removed LiveKit update_memory() tool.
They are invisible in Profile Memory but pollute agent greeting context.

Usage:
    docker compose exec api-server python scripts/cleanup_agent_memory.py
    # or locally:
    cd api-server && python scripts/cleanup_agent_memory.py
"""
import asyncio
import os
import sys

# Allow running from api-server/ root
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from dotenv import load_dotenv
load_dotenv(".env.local")
load_dotenv(".env")


async def main():
    from sqlalchemy import select, delete
    from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
    from sqlalchemy.orm import sessionmaker

    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)

    engine = create_async_engine(db_url)
    Session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with Session() as db:
        # Find all agent-memory.md records
        from app.models import AgentMemory
        result = await db.execute(
            select(AgentMemory).where(AgentMemory.filename == "agent-memory.md")
        )
        memories = result.scalars().all()

        if not memories:
            print("No agent-memory.md records found. Nothing to clean up.")
            return

        print(f"Found {len(memories)} agent-memory.md record(s):")
        for m in memories:
            preview = (m.content or "")[:100].replace("\n", " ")
            print(f"  user_id={m.user_id}  content={preview}...")

        # Delete them
        count = await db.execute(
            delete(AgentMemory).where(AgentMemory.filename == "agent-memory.md")
        )
        await db.commit()
        print(f"\nDeleted {count.rowcount} agent-memory.md record(s).")

    await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
