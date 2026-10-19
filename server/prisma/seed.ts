import { PrismaClient, type Priority, type WorkItemStatus, type WorkItemType } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();
const PASSWORD = "Password123!";

async function main() {
  await prisma.notification.deleteMany();
  await prisma.idempotencyKey.deleteMany();
  await prisma.session.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.activityEvent.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();
  await prisma.counter.deleteMany();

  const passwordHash = await bcrypt.hash(PASSWORD, 10);

  const admin = await prisma.user.create({
    data: {
      email: "admin@newtonite.local",
      name: "Avery Admin",
      passwordHash,
      platformRole: "ADMIN"
    }
  });

  const maya = await prisma.user.create({
    data: { email: "maya.chen@newtonite.local", name: "Maya Chen", passwordHash }
  });
  const jordan = await prisma.user.create({
    data: { email: "jordan.lee@newtonite.local", name: "Jordan Lee", passwordHash }
  });
  const casey = await prisma.user.create({
    data: { email: "casey.nguyen@newtonite.local", name: "Casey Nguyen", passwordHash }
  });
  const priya = await prisma.user.create({
    data: { email: "priya.shah@newtonite.local", name: "Priya Shah", passwordHash }
  });
  const alex = await prisma.user.create({
    data: { email: "alex.kim@newtonite.local", name: "Alex Kim", passwordHash }
  });
  const sam = await prisma.user.create({
    data: { email: "sam.okonkwo@newtonite.local", name: "Sam Okonkwo", passwordHash }
  });
  const riley = await prisma.user.create({
    data: { email: "riley.patel@newtonite.local", name: "Riley Patel", passwordHash }
  });
  const inactive = await prisma.user.create({
    data: {
      email: "inactive.user@newtonite.local",
      name: "Inactive User",
      passwordHash,
      isActive: false
    }
  });

  const cs = await prisma.team.create({
    data: {
      name: "Customer Success",
      slug: "customer-success",
      description: "Customer issues and account operations"
    }
  });
  const eng = await prisma.team.create({
    data: {
      name: "Engineering",
      slug: "engineering",
      description: "Product incidents and engineering problems"
    }
  });
  const finance = await prisma.team.create({
    data: {
      name: "Finance & Compliance",
      slug: "finance-compliance",
      description: "Payments, investigations, and compliance requests"
    }
  });

  await prisma.teamMembership.createMany({
    data: [
      { userId: maya.id, teamId: cs.id, role: "MANAGER" },
      { userId: jordan.id, teamId: cs.id, role: "MEMBER" },
      { userId: casey.id, teamId: cs.id, role: "VIEWER" },
      { userId: priya.id, teamId: eng.id, role: "MANAGER" },
      { userId: alex.id, teamId: eng.id, role: "MEMBER" },
      { userId: alex.id, teamId: cs.id, role: "MEMBER" },
      { userId: sam.id, teamId: finance.id, role: "MANAGER" },
      { userId: riley.id, teamId: finance.id, role: "MEMBER" },
      { userId: priya.id, teamId: finance.id, role: "VIEWER" },
      { userId: inactive.id, teamId: eng.id, role: "MEMBER" }
    ]
  });

  await prisma.counter.create({ data: { name: "workItem", value: 1000 } });

  type SeedItem = {
    title: string;
    description: string;
    type: WorkItemType;
    status: WorkItemStatus;
    priority: Priority;
    teamId: string;
    creatorId: string;
    assigneeId?: string | null;
    dueAt?: Date | null;
    hoursAgo?: number;
  };

  const hoursAgo = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);

  const seeds: SeedItem[] = [
    {
      title: "Enterprise customer cannot export invoices",
      description:
        "Northwind reports that invoice CSV export fails after 10k rows. They need a workaround before Monday close.",
      type: "CUSTOMER_ISSUE",
      status: "IN_PROGRESS",
      priority: "HIGH",
      teamId: cs.id,
      creatorId: maya.id,
      assigneeId: jordan.id,
      dueAt: hoursAgo(-20)
    },
    {
      title: "Onboarding checklist for new healthcare account",
      description: "Create operational checklist for the new healthcare customer covering SLA and data handling.",
      type: "OPERATIONAL_TASK",
      status: "OPEN",
      priority: "MEDIUM",
      teamId: cs.id,
      creatorId: maya.id,
      assigneeId: null
    },
    {
      title: "Customer reports duplicate charges in portal",
      description: "Two charges appeared for the same invoice. Needs finance investigation before we respond.",
      type: "PAYMENT_INVESTIGATION",
      status: "AWAITING_APPROVAL",
      priority: "HIGH",
      teamId: finance.id,
      creatorId: riley.id,
      assigneeId: riley.id
    },
    {
      title: "SOC2 evidence request — access reviews",
      description: "Auditor requested latest quarterly access review evidence for production systems.",
      type: "COMPLIANCE_REQUEST",
      status: "IN_REVIEW",
      priority: "CRITICAL",
      teamId: finance.id,
      creatorId: sam.id,
      assigneeId: riley.id,
      dueAt: hoursAgo(-5)
    },
    {
      title: "Production 5xx spike on checkout",
      description: "Error rate on /checkout exceeded 4% for 12 minutes. Mitigation applied; root cause still open.",
      type: "PRODUCTION_INCIDENT",
      status: "BLOCKED",
      priority: "CRITICAL",
      teamId: eng.id,
      creatorId: priya.id,
      assigneeId: alex.id,
      hoursAgo: 80
    },
    {
      title: "Search index lag after deploy",
      description: "Work item search is delayed by ~8 minutes following the last deploy. Investigate worker backlog.",
      type: "ENGINEERING_PROBLEM",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      teamId: eng.id,
      creatorId: alex.id,
      assigneeId: alex.id
    },
    {
      title: "Refund policy exception for VIP account",
      description: "Customer Success requested an out-of-policy refund. Requires finance approval before processing.",
      type: "PAYMENT_INVESTIGATION",
      status: "OPEN",
      priority: "HIGH",
      teamId: finance.id,
      creatorId: maya.id,
      assigneeId: sam.id
    },
    {
      title: "Stale follow-up on billing address mismatch",
      description: "Opened two weeks ago. No owner updates. Customer asked again today.",
      type: "CUSTOMER_ISSUE",
      status: "OPEN",
      priority: "LOW",
      teamId: cs.id,
      creatorId: jordan.id,
      assigneeId: jordan.id,
      hoursAgo: 200
    },
    {
      title: "Resolved: webhook retries overflowing queue",
      description: "Increased worker concurrency and added backoff. Monitoring for 24h.",
      type: "ENGINEERING_PROBLEM",
      status: "RESOLVED",
      priority: "HIGH",
      teamId: eng.id,
      creatorId: priya.id,
      assigneeId: alex.id
    },
    {
      title: "Closed: password reset emails delayed",
      description: "Provider outage. Communications sent. Item closed after verification.",
      type: "CUSTOMER_ISSUE",
      status: "CLOSED",
      priority: "MEDIUM",
      teamId: cs.id,
      creatorId: maya.id,
      assigneeId: jordan.id
    },
    {
      title: "Data retention exception for legal hold",
      description: "Legal requested a retention exception for one account. Must be approved before engineering changes.",
      type: "COMPLIANCE_REQUEST",
      status: "IN_PROGRESS",
      priority: "HIGH",
      teamId: finance.id,
      creatorId: sam.id,
      assigneeId: riley.id
    },
    {
      title: "Nightly job skipped customer digest",
      description: "Digest emails did not send for EU region. Engineering investigating scheduler lock.",
      type: "ENGINEERING_PROBLEM",
      status: "IN_REVIEW",
      priority: "MEDIUM",
      teamId: eng.id,
      creatorId: priya.id,
      assigneeId: alex.id
    }
  ];

  let n = 0;
  for (const s of seeds) {
    n += 1;
    const createdAt = s.hoursAgo ? hoursAgo(s.hoursAgo) : hoursAgo(12 - n);
    const updatedAt = s.hoursAgo ? hoursAgo(Math.max(1, s.hoursAgo - 4)) : hoursAgo(3 - n / 2);
    const counter = await prisma.counter.update({
      where: { name: "workItem" },
      data: { value: { increment: 1 } }
    });
    const item = await prisma.workItem.create({
      data: {
        reference: `OPS-${counter.value}`,
        title: s.title,
        description: s.description,
        type: s.type,
        status: s.status,
        priority: s.priority,
        priorityRank: { LOW: 1, MEDIUM: 2, HIGH: 3, CRITICAL: 4 }[s.priority],
        teamId: s.teamId,
        creatorId: s.creatorId,
        assigneeId: s.assigneeId ?? null,
        dueAt: s.dueAt ?? null,
        resolvedAt: s.status === "RESOLVED" || s.status === "CLOSED" ? updatedAt : null,
        closedAt: s.status === "CLOSED" ? updatedAt : null,
        createdAt,
        updatedAt
      }
    });
    await prisma.activityEvent.create({
      data: {
        workItemId: item.id,
        actorId: s.creatorId,
        type: "CREATED",
        summary: `Created ${item.reference}: ${item.title}`,
        createdAt
      }
    });
    if (s.assigneeId) {
      await prisma.activityEvent.create({
        data: {
          workItemId: item.id,
          actorId: s.creatorId,
          type: "ASSIGNED",
          field: "assigneeId",
          newValue: s.assigneeId,
          summary: "Assigned on creation",
          createdAt: new Date(createdAt.getTime() + 1000)
        }
      });
    }
    if (s.status !== "OPEN") {
      await prisma.activityEvent.create({
        data: {
          workItemId: item.id,
          actorId: s.assigneeId ?? s.creatorId,
          type: "STATUS_CHANGED",
          field: "status",
          previousValue: "OPEN",
          newValue: s.status,
          summary: `Status OPEN → ${s.status}`,
          createdAt: updatedAt
        }
      });
    }
  }

  const pendingItem = await prisma.workItem.findFirstOrThrow({
    where: { status: "AWAITING_APPROVAL" }
  });
  await prisma.approval.create({
    data: {
      workItemId: pendingItem.id,
      requestedById: riley.id,
      status: "PENDING",
      pendingKey: pendingItem.id,
      requestComment: "Need manager sign-off before we contact the customer."
    }
  });
  await prisma.activityEvent.create({
    data: {
      workItemId: pendingItem.id,
      actorId: riley.id,
      type: "APPROVAL_REQUESTED",
      summary: "Requested approval"
    }
  });

  const invoice = await prisma.workItem.findFirstOrThrow({
    where: { title: { contains: "export invoices" } }
  });
  await prisma.comment.create({
    data: {
      workItemId: invoice.id,
      authorId: jordan.id,
      body: "Reproduced in staging with a 12k-row account. Looking at streaming the CSV instead of buffering."
    }
  });
  await prisma.comment.create({
    data: {
      workItemId: invoice.id,
      authorId: maya.id,
      body: "Customer asked for a status by 16:00. Please keep the thread updated."
    }
  });

  await prisma.notification.create({
    data: {
      userId: jordan.id,
      workItemId: invoice.id,
      type: "ASSIGNED",
      title: `${invoice.reference} assigned to you`,
      body: invoice.title
    }
  });
  await prisma.notification.create({
    data: {
      userId: sam.id,
      workItemId: pendingItem.id,
      type: "APPROVAL_REQUESTED",
      title: `${pendingItem.reference} needs approval`,
      body: pendingItem.title
    }
  });

  console.log("Seeded Newtonite Ops demo data.");
  console.log("Demo password for all accounts:", PASSWORD);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
