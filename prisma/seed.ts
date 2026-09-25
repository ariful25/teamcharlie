import { PrismaClient, Role, ClientStatus, Priority, TaskStatus, ClientWorkspaceTemplate } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

function startOfWeekMonday(date: Date): Date {
  const dow = date.getUTCDay(); // 0=Sun..6=Sat
  const diffToMonday = dow === 0 ? -6 : 1 - dow;
  const base = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  return new Date(base.getTime() + diffToMonday * 24 * 60 * 60 * 1000);
}

function utcDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

async function main() {
  console.log("Seeding Charlie HQ...");

  // ---- Team ----
  const team = await prisma.team.upsert({
    where: { slug: "charlie" },
    update: {},
    create: {
      name: "Charlie",
      slug: "charlie",
      timezone: "Asia/Dhaka",
      settings: { create: {} },
    },
  });

  // ---- Categories ----
  const categoryNames = [
    "Guest Communication",
    "Check-in",
    "Check-out",
    "Cleaning",
    "Maintenance",
    "Client Communication",
    "Reservation",
    "Tenant / LTR",
    "Follow-up",
    "Administrative",
    "Attendance",
    "Other",
  ];
  const categories: Record<string, string> = {};
  for (const name of categoryNames) {
    const c = await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
    categories[name] = c.id;
  }

  // ---- Shift Types (the team's real shift structure) ----
  const shiftDefs = [
    { name: "Morning", startTime: "08:00", endTime: "17:00", colorHex: "#34d399" },
    { name: "Evening", startTime: "17:00", endTime: "01:00", colorHex: "#facc15" },
    { name: "Night", startTime: "00:00", endTime: "08:00", colorHex: "#818cf8" },
    { name: "Backup", startTime: "19:00", endTime: "03:00", colorHex: "#f472b6" },
  ];
  const shiftTypes: Record<string, string> = {};
  for (const s of shiftDefs) {
    const created = await prisma.shiftType.upsert({
      where: { teamId_name: { teamId: team.id, name: s.name } },
      update: { startTime: s.startTime, endTime: s.endTime, colorHex: s.colorHex },
      create: { ...s, teamId: team.id },
    });
    shiftTypes[s.name] = created.id;
  }

  // ---- Users ----
  const passwordHash = await bcrypt.hash("charliehq123", 10);

  const admin = await prisma.user.upsert({
    where: { email: "admin@strassistance.com" },
    update: {},
    create: {
      name: "Ayesha Rahman",
      email: "admin@strassistance.com",
      passwordHash,
      role: Role.ADMIN,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Morning"],
    },
  });

  const lead = await prisma.user.upsert({
    where: { email: "lead@strassistance.com" },
    update: {},
    create: {
      name: "Farhan Hossain",
      email: "lead@strassistance.com",
      passwordHash,
      role: Role.TEAM_LEAD,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Morning"],
    },
  });

  const john = await prisma.user.upsert({
    where: { email: "john@strassistance.com" },
    update: {},
    create: {
      name: "John Doe",
      email: "john@strassistance.com",
      passwordHash,
      role: Role.EMPLOYEE,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Evening"],
    },
  });

  const sarah = await prisma.user.upsert({
    where: { email: "sarah@strassistance.com" },
    update: {},
    create: {
      name: "Sarah Islam",
      email: "sarah@strassistance.com",
      passwordHash,
      role: Role.EMPLOYEE,
      teamId: team.id,
      defaultShiftTypeId: shiftTypes["Night"],
    },
  });

  // ---- Clients ----
  const andrea = await prisma.client.upsert({
    where: { id: "seed-client-andrea" },
    update: {},
    create: {
      id: "seed-client-andrea",
      name: "Andrea",
      status: ClientStatus.STABLE,
      guestCommunicationPlatform: "Guestly",
      operationPlatform: "ClickUp",
      clientCommunicationPlatform: "WhatsApp",
      teamId: team.id,
    },
  });

  const allen = await prisma.client.upsert({
    where: { id: "seed-client-allen" },
    update: {},
    create: {
      id: "seed-client-allen",
      name: "Allen",
      status: ClientStatus.STABLE,
      guestCommunicationPlatform: "Guestly",
      operationPlatform: "WhatsApp",
      clientCommunicationPlatform: "WhatsApp",
      teamId: team.id,
    },
  });

  const shawn = await prisma.client.upsert({
    where: { id: "seed-client-shawn" },
    update: {},
    create: {
      id: "seed-client-shawn",
      name: "Shawn",
      status: ClientStatus.ATTENTION,
      guestCommunicationPlatform: "Airbnb",
      operationPlatform: "WhatsApp",
      clientCommunicationPlatform: "WhatsApp",
      teamId: team.id,
    },
  });

  const perfectStay = await prisma.client.upsert({
    where: { id: "seed-client-perfectstay" },
    update: {},
    create: {
      id: "seed-client-perfectstay",
      name: "Perfect Stay",
      status: ClientStatus.WAITING,
      notes: "STR + LTR — full workflow pending configuration. Placeholder client only.",
      teamId: team.id,
    },
  });

  const jack = await prisma.client.upsert({
    where: { id: "seed-client-jack" },
    update: {},
    create: {
      id: "seed-client-jack",
      name: "Jack",
      status: ClientStatus.WAITING,
      notes: "Workflow pending configuration.",
      teamId: team.id,
    },
  });

  await prisma.client.update({
    where: { id: perfectStay.id },
    data: {
      status: ClientStatus.ATTENTION,
      // Opts this specific client into the Property/Unit/Tenancy/Lead LTR
      // workspace (components/properties/perfect-stay-workspace.tsx)
      // instead of the generic Tasks/Issues workspace every other client
      // gets by default — a data flag, not a client.name === "Perfect Stay"
      // check, so renaming this client can never break it.
      workspaceTemplate: ClientWorkspaceTemplate.PERFECT_STAY_LTR,
      notes:
        "Tenant policy: credit score 670+ and income >=3x rent required; 620-669 requires an extra month's rent as additional deposit; below 620 or any eviction/criminal history is not accepted. International students provide full name, email, phone, move-in date, nationality, lease term, passport photo, and student ID; initial payment is 2 months' rent as deposit plus cleaning fee plus first month's rent. Whole-house utilities are tenant-owned or Perfect Stay-managed with a 10% admin surcharge and prepaid top-up balance. Lease closes after signature plus deposit, first rent, and cleaning fee. Reference docs: English https://docs.google.com/document/d/16q-wwHafEaQXJiPoCuuBCJcWUdCJu8FRpCuLG2KT3YE/edit ; Chinese https://docs.google.com/document/d/18l1d5eYuyyqee62PGNzyS3jloG6gBUfUPv1mhxv3sRQ/edit",
    },
  });

  const propertyDefs = [
    { id: "ps-property-duffy", internalCode: "Duffy", address: "548 E Duffy Street", city: "Savannah", state: "GA", zip: "31401", redfinLink: "https://redf.in/v00nIp", googleMapsLink: "https://maps.app.goo.gl/xvKin4enLkDeB3zk9", driveTimesNote: "Forsyth Park 5m, Bacon Park Golf 12m, Airport 25m, Enmarket Arena 8m, River Street 15m, Tybee Island 29m, Hospital 10m.", generalNotes: "Thermostat video: https://youtube.com/shorts/EwSBpgAR9PM?si=b9ssfVlIpzJjGccn. Parking guide: https://drive.google.com/file/d/10ISGqjwYWLyrkUkVenGv2Rf6um15IxWq/view. Street parking in front on both sides; fenced backyard." },
    { id: "ps-property-37th", internalCode: "37th", address: "509 W 37th St", city: "Savannah", state: "GA", zip: "31415", redfinLink: "https://www.redfin.com/GA/Savannah/509-W-37th-St-31415/unit-1-2/home/120885836", googleMapsLink: "https://maps.app.goo.gl/x9pGJEWeW4xYm9hh6", driveTimesNote: "Forsyth 5m, Bacon Park Golf 15m, Airport 20m, Enmarket 5m, River Street 10m, Tybee 31m.", generalNotes: "Parking lot photo: https://drive.google.com/file/d/1w8ZrFdFVi1A35FYh7fkLprMBn00G8_aF/view. Common lane docs: https://docs.google.com/document/d/1VHQ4ZCkXJvyOFKHT9iebZ4GPSmBqL0U7FEw4jy182aw/edit. Driveway docs: https://docs.google.com/document/d/1XDOzVET72CSNudtEInAa75CvoffrVOhEPXbOn_wkhD8/edit. Planned dog park note may be outdated." },
    { id: "ps-property-louisiana", internalCode: "Louisiana", address: "2161 Louisiana Ave", city: "Savannah", state: "GA", zip: "31404", redfinLink: "https://www.redfin.com/GA/Savannah/2161-Louisiana-Ave-31404/home/121723066", googleMapsLink: "https://maps.app.goo.gl/2Gj6eWSVAXqQPAdx9", driveTimesNote: "Forsyth 9m, Bacon 12m, Airport 30m, Enmarket 14m, River Street 10m, Tybee 25m, Hospital 8m.", generalNotes: "Back-house entrance guide: https://drive.google.com/file/d/1odoEmQjkYJXY8J3Xa-M_PM1Dw9FtPioW/view. Fenced backyard, dog house, dog toys." },
    { id: "ps-property-hospital", internalCode: "Hospital", address: "1203 East 72nd St", city: "Savannah", state: "GA", zip: "31404", redfinLink: "https://www.redfin.com/GA/Savannah/1203-E-72nd-St-31404/home/122284325", googleMapsLink: "https://maps.app.goo.gl/mqQgNnY27ECcuVfG6", driveTimesNote: "Forsyth 10m, Bacon 5m, Airport 30m, Enmarket 15m, River Street 18m, Tybee 25m, Hospital 5m.", generalNotes: "4,000 sq ft backyard, dog house, dog toys. Cleaning closet is inside the Blue room." },
    { id: "ps-property-31st", internalCode: "31st", address: "1706 E 31st St", city: "Savannah", state: "GA", zip: "31404", redfinLink: "https://www.redfin.com/GA/Savannah/1706-E-31st-St-31404/home/120862902", googleMapsLink: "https://maps.app.goo.gl/wcjFCy5B9XLV6rQAA", driveTimesNote: "Forsyth 7m, Bacon 10m, Airport 33m, Enmarket 11m, River Street 13m, Tybee 27m, Hospital 8m.", generalNotes: "Source sheet says finish remaining information; leave unknown fields blank." },
    { id: "ps-property-stiles", internalCode: "Stiles", address: "1102 Stiles Ave", city: "Savannah", state: "GA", zip: "31415", zillowLink: "https://www.zillow.com/homedetails/1102-Stiles-Ave-Savannah-GA-31415/14157157_zpid", googleMapsLink: "https://maps.app.goo.gl/xoQzeH49jiqAx7bJ8", driveTimesNote: "Forsyth 9m, Bacon 12m, Airport 30m, Enmarket 14m, River Street 10m, Tybee 25m, Hospital 8m.", generalNotes: "Sparse source detail; unit amenities still need to be filled in." },
    { id: "ps-property-mississippi", internalCode: "Mississippi", address: "2148 Mississippi Ave", city: "Savannah", state: "GA", zip: "31404", zillowLink: "https://www.zillow.com/homedetails/2148-Mississippi-Ave-Savannah-GA-31404/14160254_zpid", googleMapsLink: "https://share.google/331eOU20WqVeBIxu7", driveTimesNote: "Template drive times: 9/12/30/14/10/25/8.", generalNotes: "Drive times unverified. Door codes in source: 3690 internal crew, 1369 tenants. Separate standalone property, not a room within Louisiana." },
    { id: "ps-property-anderson", internalCode: "Anderson", address: "1125 E Anderson St", city: "Savannah", state: "GA", zip: "31404", generalNotes: "No property reference sheet provided yet; Redfin/Zillow links, drive times, and amenities still need to be filled in." },
    { id: "ps-property-redwood", internalCode: "Redwood", address: "836 Boardwalk Place", city: "Redwood City", state: "CA", zip: "94065", generalNotes: "Out-of-Savannah property; no Redfin/Airbnb/amenity data provided." },
  ];

  for (const p of propertyDefs) {
    await prisma.property.upsert({
      where: { id: p.id },
      update: { ...p, clientId: perfectStay.id, active: true },
      create: { ...p, clientId: perfectStay.id },
    });
  }

  const unitDefs = [
    { id: "ps-unit-duffy-duplex", propertyId: "ps-property-duffy", internalName: "Duffy + Broad (whole duplex)", listingLevel: "WHOLE_PROPERTY", bedBathConfig: "4B2B front + 2B2B back", hasSofaBed: true, parkingInfo: "Both units street parking", petPolicy: "2 pets included in pet fee", airbnbLink: "https://www.airbnb.com/rooms/1362918813407235977", vrboLink: "https://www.vrbo.com/supply/home?propertyId=113199582" },
    { id: "ps-unit-duffy-front", propertyId: "ps-property-duffy", internalName: "Duffy Front (4B2B) - Yellow Door", listingLevel: "WHOLE_HOUSE", bedBathConfig: "4B2B", thermostatLocation: "Kitchen wall (Google Nest)", petPolicy: "2 pets included", airbnbLink: "https://www.airbnb.com/rooms/1252852516193520566", vrboLink: "https://www.vrbo.com/supply/home?propertyId=111710133" },
    { id: "ps-unit-castle", propertyId: "ps-property-duffy", parentUnitId: "ps-unit-duffy-front", internalName: "Castle", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Sharing 2 bathrooms", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1253618096807175317" },
    { id: "ps-unit-forest", propertyId: "ps-property-duffy", parentUnitId: "ps-unit-duffy-front", internalName: "Forest", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Sharing 2 bathrooms", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1254572776391629398" },
    { id: "ps-unit-bubble", propertyId: "ps-property-duffy", parentUnitId: "ps-unit-duffy-front", internalName: "Bubble", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Sharing 2 bathrooms", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1253624830590508042" },
    { id: "ps-unit-ocean", propertyId: "ps-property-duffy", parentUnitId: "ps-unit-duffy-front", internalName: "Ocean", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Sharing 2 bathrooms", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1254564551332417504" },
    { id: "ps-unit-broad", propertyId: "ps-property-duffy", internalName: "Broad Street (2B2B) - Black Door", listingLevel: "WHOLE_HOUSE", bedBathConfig: "2B2B", hasSofaBed: true, thermostatLocation: "Nearby kitchen wall (Google Nest)", petPolicy: "2 pets included", airbnbLink: "https://www.airbnb.com/rooms/1265142145098870286", vrboLink: "https://www.vrbo.com/supply/home?propertyId=111710239" },
    { id: "ps-unit-zen", propertyId: "ps-property-duffy", parentUnitId: "ps-unit-broad", internalName: "Zen", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Dedicated bathroom", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: false, airbnbLink: "https://www.airbnb.com/rooms/1267434046340777852" },
    { id: "ps-unit-dawn", propertyId: "ps-property-duffy", parentUnitId: "ps-unit-broad", internalName: "Dawn", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Dedicated bathroom", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1267443828253328752" },
    { id: "ps-unit-37th-duplex", propertyId: "ps-property-37th", internalName: "37th (whole duplex)", listingLevel: "WHOLE_PROPERTY", hasSofaBed: true, parkingInfo: "Back driveway parking", petPolicy: "2 pets included", airbnbLink: "https://www.airbnb.com/rooms/1329360426734706361", vrboLink: "https://www.vrbo.com/supply/home?propertyId=113198105" },
    { id: "ps-unit-37th-1st", propertyId: "ps-property-37th", internalName: "37th 1st Floor (Door A)", listingLevel: "WHOLE_HOUSE", hasSofaBed: true, thermostatLocation: "Dining area wall (not Nest)", parkingInfo: "Dedicated parking spot A&B&C", petPolicy: "2 pets included", airbnbLink: "https://www.airbnb.com/rooms/1335509507475169535", vrboLink: "https://www.vrbo.com/supply/home?propertyId=111674879" },
    { id: "ps-unit-37th-1a", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-1st", internalName: "1A Recharge Zone", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1 bath", bedType: "Queen size bed", parkingInfo: "Common lane parking", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1274947102953020148" },
    { id: "ps-unit-37th-1b", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-1st", internalName: "1B Getaway Suite", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Attached bath", bedType: "Queen size bed", parkingInfo: "Back driveway spot A", petPolicy: "1 pet included", hasTV: false, airbnbLink: "https://www.airbnb.com/rooms/1274950362655992212" },
    { id: "ps-unit-37th-1c", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-1st", internalName: "1C Starry Night", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1 bath", bedType: "Queen size bed", parkingInfo: "Back driveway spot B", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1274948392027065988" },
    { id: "ps-unit-37th-1d", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-1st", internalName: "1D Florist Room", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1 bath", bedType: "Queen size bed", parkingInfo: "Back driveway spot C", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1274949368186275073" },
    { id: "ps-unit-37th-2nd", propertyId: "ps-property-37th", internalName: "37th 2nd Floor (Door B)", listingLevel: "WHOLE_HOUSE", thermostatLocation: "Hallway (not Nest)", parkingInfo: "Lot next door common area", petPolicy: "2 pets included", airbnbLink: "https://www.airbnb.com/rooms/1369594364403904923", vrboLink: "https://www.vrbo.com/supply/home?propertyId=113195597" },
    { id: "ps-unit-37th-2a", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-2nd", internalName: "2A French Loft", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1.5 bath", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1342206943899089478" },
    { id: "ps-unit-37th-2b", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-2nd", internalName: "2B Victorian Charm", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1.5 bath", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1369096336884422661" },
    { id: "ps-unit-37th-2c", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-2nd", internalName: "2C Sunshine Oasis", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1.5 bath", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1379945254627517381" },
    { id: "ps-unit-37th-2d", propertyId: "ps-property-37th", parentUnitId: "ps-unit-37th-2nd", internalName: "2D Cloudy Dream", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1.5 bath", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1370194333470912377" },
    { id: "ps-unit-louisiana-house", propertyId: "ps-property-louisiana", internalName: "Louisiana (3BR/1BA whole house)", listingLevel: "WHOLE_HOUSE", bedBathConfig: "3BR/1BA", thermostatLocation: "Hallway (not Nest)", parkingInfo: "Street parking on Louisiana Ave or Connecticut Ave", petPolicy: "2 pets included", airbnbLink: "https://www.airbnb.com/rooms/1348291429820382656", vrboLink: "https://www.vrbo.com/supply/home?propertyId=111710206" },
    { id: "ps-unit-big-wilmington", propertyId: "ps-property-louisiana", parentUnitId: "ps-unit-louisiana-house", internalName: "Big Wilmington", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1 bath", bedType: "Queen size bed", parkingInfo: "Front-yard parking; 2 street spots", petPolicy: "1 pet included", hasTV: false, airbnbLink: "https://www.airbnb.com/rooms/1221058838677687294" },
    { id: "ps-unit-mid-hamilton", propertyId: "ps-property-louisiana", parentUnitId: "ps-unit-louisiana-house", internalName: "Mid Hamilton", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1 bath", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: false, airbnbLink: "https://www.airbnb.com/rooms/1220984048350767062" },
    { id: "ps-unit-small-tybee", propertyId: "ps-property-louisiana", parentUnitId: "ps-unit-louisiana-house", internalName: "Small Tybee", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Share 1 bath", bedType: "Full size bed", petPolicy: "1 pet included", hasTV: false, airbnbLink: "https://www.airbnb.com/rooms/1221018376636175787" },
    { id: "ps-unit-louisiana-back", propertyId: "ps-property-louisiana", internalName: "Louisiana Back House", listingLevel: "DETACHED_UNIT", bedBathConfig: "Own private bed+bath", parkingInfo: "Parking directly in front", petPolicy: "2 pets included", hasTV: true, airbnbLink: "https://www.airbnb.com/rooms/1167875139346251618" },
    { id: "ps-unit-hospital-house", propertyId: "ps-property-hospital", internalName: "Hospital (2BR/2BA whole house)", listingLevel: "WHOLE_HOUSE", bedBathConfig: "2BR/2BA", thermostatLocation: "Hallway (not Nest)", parkingInfo: "Driveway or street parking", petPolicy: "2 pets included", airbnbLink: "https://www.airbnb.com/rooms/1216935082943812947", vrboLink: "https://www.vrbo.com/supply/home?propertyId=111709221" },
    { id: "ps-unit-blue", propertyId: "ps-property-hospital", parentUnitId: "ps-unit-hospital-house", internalName: "Blue", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Attached bath", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: false, airbnbLink: "https://www.airbnb.com/rooms/1217068825585159117" },
    { id: "ps-unit-pink", propertyId: "ps-property-hospital", parentUnitId: "ps-unit-hospital-house", internalName: "Pink", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Dedicated bath", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: false, airbnbLink: "https://www.airbnb.com/rooms/1217077163658206066" },
    { id: "ps-unit-31st-house", propertyId: "ps-property-31st", internalName: "31st (3BR/2BA whole house)", listingLevel: "WHOLE_HOUSE", bedBathConfig: "3BR/2BA", thermostatLocation: "Hallway", parkingInfo: "Street parking or driveway", petPolicy: "2 pets included" },
    { id: "ps-unit-sage", propertyId: "ps-property-31st", parentUnitId: "ps-unit-31st-house", internalName: "Sage", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Full private bathroom", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true },
    { id: "ps-unit-rose", propertyId: "ps-property-31st", parentUnitId: "ps-unit-31st-house", internalName: "Rose", listingLevel: "PRIVATE_ROOM", bedType: "Queen size bed", petPolicy: "1 pet included", hasTV: true },
    { id: "ps-unit-golden-dusk", propertyId: "ps-property-31st", parentUnitId: "ps-unit-31st-house", internalName: "Golden Dusk", listingLevel: "PRIVATE_ROOM", bedType: "Queen size bed", petPolicy: "2 pets included", hasTV: true },
    { id: "ps-unit-stiles-main", propertyId: "ps-property-stiles", internalName: "Stiles Main", listingLevel: "WHOLE_HOUSE", bedBathConfig: "3BR/1BA" },
    { id: "ps-unit-mississippi-house", propertyId: "ps-property-mississippi", internalName: "Mississippi (whole house)", listingLevel: "WHOLE_HOUSE" },
    { id: "ps-unit-anderson-1a", propertyId: "ps-property-anderson", internalName: "1A Olive Suite", listingLevel: "PRIVATE_ROOM", bedBathConfig: "Attached bath", bedType: "Queen size bed" },
    { id: "ps-unit-anderson-2a", propertyId: "ps-property-anderson", internalName: "2A Willow", listingLevel: "PRIVATE_ROOM" },
    { id: "ps-unit-anderson-2b", propertyId: "ps-property-anderson", internalName: "2B Cypress", listingLevel: "PRIVATE_ROOM" },
    { id: "ps-unit-anderson-2c", propertyId: "ps-property-anderson", internalName: "2C Laurel Room", listingLevel: "PRIVATE_ROOM" },
    { id: "ps-unit-anderson-2d", propertyId: "ps-property-anderson", internalName: "2D Fern Studio", listingLevel: "DETACHED_UNIT" },
    { id: "ps-unit-redwood-2b1b", propertyId: "ps-property-redwood", internalName: "Redwood 2B1B", listingLevel: "WHOLE_HOUSE", bedBathConfig: "2B1B", parkingInfo: "1 dedicated parking spot, 1 garage", petPolicy: "Don't allow pet" },
  ];

  for (const unit of unitDefs) {
    await prisma.unit.upsert({
      where: { id: unit.id },
      update: { ...unit, active: true } as any,
      create: unit as any,
    });
  }

  const tenancyDefs = [
    { id: "ps-tenancy-redwood-current", unitId: "ps-unit-redwood-2b1b", status: "CURRENT", tenantName: "Michelle Wen Cheung & Kayla Jacqueline Yee", moveInDate: "2026-05-01", moveOutDate: "2026-08-09", leaseSource: "Zillow", rentAmount: 4500, securityDeposit: 2500 },
    { id: "ps-tenancy-redwood-upcoming", unitId: "ps-unit-redwood-2b1b", status: "UPCOMING", tenantName: "Xiaochen Han & Ruisi Zhang", moveInDate: "2026-08-10", moveOutDate: "2027-08-10", leaseSource: "Mid-term via Zillow", rentAmount: 4500, notes: "Rent $4,500 with utilities / $4,200 without." },
    { id: "ps-tenancy-stiles-current", unitId: "ps-unit-stiles-main", status: "CURRENT", tenantName: "Paolo Stucchi", moveInDate: "2025-08-11", moveOutDate: "2026-08-10", rentAmount: 1500, securityDeposit: 1000, cleaningFee: 200 },
    { id: "ps-tenancy-31st-house-current", unitId: "ps-unit-31st-house", status: "CURRENT", tenantName: "Cervantes, Arely", moveInDate: "2025-07-05", moveOutDate: "2030-09-05", leaseSource: "Long-term via Zillow", rentAmount: 2000, securityDeposit: 2000, notes: "Deposit assumed at one month's rent; source sheet listed $250, likely a data entry error." },
    { id: "ps-tenancy-sage-current", unitId: "ps-unit-sage", status: "CURRENT", tenantName: "Kefi Maxwell", moveInDate: "2025-08-01", moveOutDate: "2026-07-31", rentAmount: 1200, securityDeposit: 600, cleaningFee: 110, utilitiesNote: "Included" },
    { id: "ps-tenancy-golden-dusk-current", unitId: "ps-unit-golden-dusk", status: "CURRENT", tenantName: "West Sky", moveInDate: "2025-10-24", moveOutDate: "2026-10-31", rentAmount: 900, securityDeposit: 500, cleaningFee: 80, utilitiesNote: "Included" },
    { id: "ps-tenancy-rose-current", unitId: "ps-unit-rose", status: "CURRENT", tenantName: "Dominic Schatz", moveInDate: "2026-02-14", moveOutDate: "2027-02-13", rentAmount: 900, securityDeposit: 500, cleaningFee: 80, utilitiesNote: "Included" },
    { id: "ps-tenancy-37th-1a-upcoming", unitId: "ps-unit-37th-1a", status: "UPCOMING", tenantName: "Leah Abigail", moveInDate: "2026-09-01", moveOutDate: "2028-08-30", rentAmount: 950, securityDeposit: 950, cleaningFee: 80, utilitiesNote: "Included", notes: "New group of tenants will move in Sep 1 and take over all house." },
    { id: "ps-tenancy-37th-1b-upcoming", unitId: "ps-unit-37th-1b", status: "UPCOMING", tenantName: "Josephine A. Goodwin", moveInDate: "2026-09-01", moveOutDate: "2028-08-30", rentAmount: 1150, securityDeposit: 1200, cleaningFee: 110, utilitiesNote: "Included" },
    { id: "ps-tenancy-37th-1c-upcoming", unitId: "ps-unit-37th-1c", status: "UPCOMING", tenantName: "Grace Autumn English", moveInDate: "2026-09-01", moveOutDate: "2028-08-30", rentAmount: 950, securityDeposit: 950, cleaningFee: 80, utilitiesNote: "Included" },
    { id: "ps-tenancy-37th-1d-upcoming", unitId: "ps-unit-37th-1d", status: "UPCOMING", tenantName: "Kylie Hydock", moveInDate: "2026-09-01", moveOutDate: "2028-08-30", rentAmount: 900, securityDeposit: 500, cleaningFee: 80, utilitiesNote: "Included" },
    { id: "ps-tenancy-37th-2a-current", unitId: "ps-unit-37th-2a", status: "CURRENT", tenantName: "Chiara (Airbnb-sourced)", moveInDate: "2026-09-01", moveOutDate: "2027-03-14", notes: "existing tenant may be paying rent through June 11 pending confirmation - check OpenPhone messages" },
    { id: "ps-tenancy-37th-2b-current", unitId: "ps-unit-37th-2b", status: "CURRENT", tenantName: "Ryan Trombley", moveInDate: "2026-06-08", moveOutDate: "2026-08-22", rentAmount: 950, securityDeposit: 950, cleaningFee: 80 },
    { id: "ps-tenancy-37th-2c-current", unitId: "ps-unit-37th-2c", status: "CURRENT", tenantName: "Daniel Lugardo-Perez", moveInDate: "2026-06-11", moveOutDate: "2026-07-11", rentAmount: 950, securityDeposit: 950, cleaningFee: 80 },
    { id: "ps-tenancy-37th-2c-upcoming", unitId: "ps-unit-37th-2c", status: "UPCOMING", tenantName: "Nishad", moveInDate: "2026-09-01", moveOutDate: "2026-09-30", rentAmount: 950, securityDeposit: 950, cleaningFee: 80 },
    { id: "ps-tenancy-37th-2d-vacant", unitId: "ps-unit-37th-2d", status: "VACANT", tenantName: null, rentAmount: 950, securityDeposit: 950, cleaningFee: 80, notes: "Searching for new tenant." },
    { id: "ps-tenancy-duffy-front-transition", unitId: "ps-unit-duffy-front", status: "AIRBNB_TRANSITION", tenantName: "Maggie, Jonah Vote, Diego Rangel, Aiden Hogan, Livia Ferrante", moveInDate: "2026-08-27", moveOutDate: "2027-08-31", nextTenantName: "Maggie, Jonah Vote, Diego Rangel, Aiden Hogan, Livia Ferrante", nextTenantMoveIn: "2026-09-01", leaseSource: "Long-term via Zillow", rentAmount: 3700, notes: "Current tenants move out Aug 1; next group moves in Sep 1. Planned to run as Airbnb in the gap." },
    { id: "ps-tenancy-zen-current", unitId: "ps-unit-zen", status: "CURRENT", tenantName: "Caleb Gerard (aka Brown, Caleb)", moveInDate: "2025-08-01", moveOutDate: "2026-07-31", rentAmount: 1300, securityDeposit: 800, cleaningFee: 150 },
    { id: "ps-tenancy-dawn-current", unitId: "ps-unit-dawn", status: "CURRENT", tenantName: "Phontakorn Reaungtrakul", moveInDate: "2025-08-28", moveOutDate: "2026-08-27", rentAmount: 1350, securityDeposit: 1000, cleaningFee: 120 },
    { id: "ps-tenancy-big-wilmington-current", unitId: "ps-unit-big-wilmington", status: "CURRENT", tenantName: "Ellie Kurtz", moveInDate: "2025-07-28", moveOutDate: "2026-08-31", leaseSource: "Long-term via Zillow/Facebook", rentAmount: 1000, securityDeposit: 900, cleaningFee: 80 },
    { id: "ps-tenancy-mid-hamilton-current", unitId: "ps-unit-mid-hamilton", status: "CURRENT", tenantName: "Aimee", moveInDate: "2026-07-13", moveOutDate: "2027-07-31", notes: "Asking for a 6-month extension." },
    { id: "ps-tenancy-small-tybee-current", unitId: "ps-unit-small-tybee", status: "CURRENT", tenantName: "Miranda Huber", moveInDate: "2025-09-10", moveOutDate: "2026-09-30", notes: "Check on her messages, she wants to extend?" },
    { id: "ps-tenancy-louisiana-back-current", unitId: "ps-unit-louisiana-back", status: "CURRENT", tenantName: "Grant C", moveInDate: "2026-07-01", moveOutDate: "2026-07-26", leaseSource: "Likely mid-term/Furnished Finder turnover", rentAmount: 1600, securityDeposit: 1600, cleaningFee: 120, petFee: 60 },
    { id: "ps-tenancy-louisiana-back-upcoming", unitId: "ps-unit-louisiana-back", status: "UPCOMING", tenantName: "Marquita Shenell Maxwell", moveInDate: "2026-09-01", moveOutDate: "2027-02-28", rentAmount: 1700, securityDeposit: 1600, cleaningFee: 120, petFee: 60 },
    { id: "ps-tenancy-mississippi-current", unitId: "ps-unit-mississippi-house", status: "CURRENT", tenantName: "Preston (Douglas) Goss", moveInDate: "2026-03-01", moveOutDate: "2028-02-28", leaseSource: "Long-term via Zillow", rentAmount: 1750, securityDeposit: 1750, cleaningFee: 250 },
    { id: "ps-tenancy-anderson-1a-current", unitId: "ps-unit-anderson-1a", status: "CURRENT", tenantName: "Putthi Rath", moveInDate: "2026-05-28", moveOutDate: "2026-06-30", leaseSource: "Short Airbnb stay" },
    { id: "ps-tenancy-anderson-1a-upcoming", unitId: "ps-unit-anderson-1a", status: "UPCOMING", tenantName: "Antonia \"Toni\" Levy", moveInDate: "2026-07-05", moveOutDate: "2026-10-11", rentAmount: 1300, securityDeposit: 700, cleaningFee: 110, petFee: 50 },
    { id: "ps-tenancy-anderson-2a-current", unitId: "ps-unit-anderson-2a", status: "CURRENT", tenantName: "Erin Theresa", moveInDate: "2026-05-28", moveOutDate: "2027-05-31", leaseSource: "Long-term", rentAmount: 850, securityDeposit: 500, cleaningFee: 80 },
    { id: "ps-tenancy-anderson-2d-current", unitId: "ps-unit-anderson-2d", status: "CURRENT", tenantName: "Carly Jaskulski", moveInDate: "2026-05-16", moveOutDate: "2026-10-15", leaseSource: "Furnished Finder", rentAmount: 1400, securityDeposit: 1200, cleaningFee: 120 },
    { id: "ps-tenancy-anderson-2b-current", unitId: "ps-unit-anderson-2b", status: "CURRENT", tenantName: "Bethany Thompson", moveInDate: "2026-05-20", moveOutDate: "2026-11-20", leaseSource: "Airbnb-sourced", rentAmount: 950, securityDeposit: 950, cleaningFee: 80 },
    { id: "ps-tenancy-anderson-2c-current", unitId: "ps-unit-anderson-2c", status: "CURRENT", tenantName: "Shairen Suleima Espino Labra", moveInDate: "2026-05-11", moveOutDate: "2026-11-11", rentAmount: 950, securityDeposit: 950, cleaningFee: 80 },
  ];

  for (const t of tenancyDefs) {
    const { id, moveInDate, moveOutDate, nextTenantMoveIn, nextTenantMoveOut, ...data } = t as any;
    await prisma.tenancy.upsert({
      where: { id },
      update: {
        ...data,
        moveInDate: moveInDate ? utcDate(moveInDate) : null,
        moveOutDate: moveOutDate ? utcDate(moveOutDate) : null,
        nextTenantMoveIn: nextTenantMoveIn ? utcDate(nextTenantMoveIn) : null,
        nextTenantMoveOut: nextTenantMoveOut ? utcDate(nextTenantMoveOut) : null,
      },
      create: {
        id,
        ...data,
        moveInDate: moveInDate ? utcDate(moveInDate) : null,
        moveOutDate: moveOutDate ? utcDate(moveOutDate) : null,
        nextTenantMoveIn: nextTenantMoveIn ? utcDate(nextTenantMoveIn) : null,
        nextTenantMoveOut: nextTenantMoveOut ? utcDate(nextTenantMoveOut) : null,
      },
    });
  }

  // ---- Shift Assignments: this week, Mon..Sun, for every employee ----
  const weekStart = startOfWeekMonday(new Date());
  const employeeShift = [
    { user: admin, shiftTypeId: shiftTypes["Morning"] },
    { user: lead, shiftTypeId: shiftTypes["Morning"] },
    { user: john, shiftTypeId: shiftTypes["Evening"] },
    { user: sarah, shiftTypeId: shiftTypes["Night"] },
  ];
  for (let idx = 0; idx < employeeShift.length; idx++) {
    const { user, shiftTypeId } = employeeShift[idx];
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart.getTime() + i * 24 * 60 * 60 * 1000);
      // One weekend day per person, staggered across the week — mirrors the
      // spreadsheet's pattern of everyone getting one day off a week.
      const isWeekendDay = i === (idx + 2) % 7;
      await prisma.shiftAssignment.upsert({
        where: { userId_date: { userId: user.id, date } },
        update: {},
        create: {
          userId: user.id,
          date,
          shiftTypeId,
          status: isWeekendDay ? "WEEKEND" : "WORKING",
          createdBy: admin.id,
        },
      });
    }
  }

  // ---- Tasks (idempotent — keyed by a stable seed id so reseeding never duplicates) ----
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const taskDefs = [
    {
      id: "seed-task-andrea-morning",
      clientId: andrea.id,
      categoryId: categories["Guest Communication"],
      assignedUserId: john.id,
      title: "Andrea — Check overnight guest messages",
      startTime: "07:00",
      dueTime: "08:00",
      priority: Priority.IMPORTANT,
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      completedBy: john.id,
      isRecurringTemplate: true,
      repeatMode: "DAILY" as const,
    },
    {
      id: "seed-task-allen-morning",
      clientId: allen.id,
      categoryId: categories["Guest Communication"],
      assignedUserId: sarah.id,
      title: "Allen — Morning guest message review",
      startTime: "07:15",
      dueTime: "08:15",
      priority: Priority.NORMAL,
      status: TaskStatus.COMPLETED,
      completedAt: new Date(),
      completedBy: sarah.id,
      isRecurringTemplate: true,
      repeatMode: "DAILY" as const,
    },
    {
      id: "seed-task-shawn-morning",
      clientId: shawn.id,
      categoryId: categories["Guest Communication"],
      assignedUserId: john.id,
      title: "Shawn — Airbnb inbox review",
      startTime: "07:30",
      dueTime: "08:30",
      priority: Priority.IMPORTANT,
      status: TaskStatus.IN_PROGRESS,
      isRecurringTemplate: true,
      repeatMode: "DAILY" as const,
    },
    {
      id: "seed-task-perfectstay-onboarding",
      clientId: perfectStay.id,
      categoryId: categories["Administrative"],
      assignedUserId: lead.id,
      title: "Perfect Stay — Follow up on onboarding checklist",
      startTime: "10:00",
      dueTime: "11:00",
      priority: Priority.NORMAL,
      status: TaskStatus.UPCOMING,
      isRecurringTemplate: false,
      repeatMode: "NONE" as const,
    },
    {
      id: "seed-task-jack-intro",
      clientId: jack.id,
      categoryId: categories["Client Communication"],
      assignedUserId: sarah.id,
      title: "Jack — Introductory workflow call",
      startTime: "09:00",
      dueTime: "09:30",
      priority: Priority.NORMAL,
      status: TaskStatus.OVERDUE,
      isRecurringTemplate: false,
      repeatMode: "NONE" as const,
    },
  ];

  for (const t of taskDefs) {
    const { id, ...data } = t;
    await prisma.task.upsert({
      where: { id },
      update: {},
      create: { id, ...data, date: today, teamId: team.id },
    });
  }

  const perfectStayRecurringTasks = [
    { id: "ps-task-facebook-availability", title: "Facebook - message people about rental availability", category: "Client Communication", repeatMode: "DAILY" },
    { id: "ps-task-rentredi-ads", title: "Post rental ads on RentRedi", category: "Administrative", repeatMode: "WEEKLY", repeatDays: [1, 4] },
    { id: "ps-task-duffy-airbnb-listing", title: "Duffy - list/unlist on Airbnb outside working hours, list on weekends", category: "Reservation", repeatMode: "DAILY" },
    { id: "ps-task-airbnb-cleanings", title: "Check Airbnb check-ins and schedule cleanings", category: "Cleaning", repeatMode: "DAILY" },
    { id: "ps-task-furnished-finder", title: "Furnished Finder - review messages and cross-sell other listings", category: "Client Communication", repeatMode: "DAILY" },
    { id: "ps-task-daily-revenue", title: "Daily revenue update for Airbnb properties", category: "Administrative", repeatMode: "DAILY" },
    { id: "ps-task-vacant-rooms", title: "Daily update on current vacant rooms", category: "Administrative", repeatMode: "DAILY" },
  ];

  for (const task of perfectStayRecurringTasks) {
    await prisma.task.upsert({
      where: { id: task.id },
      update: {
        title: task.title,
        categoryId: categories[task.category],
        repeatMode: task.repeatMode as any,
        repeatDays: task.repeatDays ?? [],
        isRecurringTemplate: true,
      },
      create: {
        id: task.id,
        clientId: perfectStay.id,
        categoryId: categories[task.category],
        assignedUserId: null,
        title: task.title,
        date: today,
        priority: Priority.NORMAL,
        status: TaskStatus.UPCOMING,
        teamId: team.id,
        isRecurringTemplate: true,
        repeatMode: task.repeatMode as any,
        repeatDays: task.repeatDays ?? [],
      },
    });
  }

  const leadDefs = [
    ["Nikki Payne", "Facebook", "Sent a message"], ["Emily Alyssa", "Facebook", "Sent a message"], ["Mehmet Nege", "Facebook", "Waiting for response"], ["Gary Ingersoll", "Facebook", "Waiting for response"], ["Amber Carrillo", "Facebook", "Waiting for response"], ["Ivory Swaby", "Facebook", "Sent a message"], ["Linda T Lee", "Facebook", "Sent a message"], ["Ann Abdul", "Realtor.com", "Sent a text"], ["Lina Maria Garcia", "Facebook", "Sent a message"], ["Eledea Black", "Facebook", "Sent a message"], ["Asher Caleb", "Facebook", "Sent a message"], ["Suzanne Severance", "Facebook", "Sent a message"], ["Keertana Gupta", "Facebook", "Sent a message"], ["Stacey Samedi", "Facebook", "Sent a message"], ["Ian Oliver", "Facebook", "Sent a message"], ["Melissa Miller", "Facebook", "Sent a message", "Looking for a room for her daughter, a SCAD student"], ["Aria Wang", "Facebook", "Sent a message", "Looking for a room for a friend (Hnin, a traveling nurse)"], ["Mark Young", "Facebook", "Sent a message"], ["Ashley Dustin", "Facebook", "Reached out to us"], ["Melissa Sanchez", "Facebook", "Sent a message"], ["Parker Paige", "Facebook", "Sent a message"], ["West Nelson", "Facebook", "Sent a message"], ["MB Bowen", "Facebook", "Sent a message", "Looking for a room for her daughter, gave her our number"], ["Yasmin Reis", "Facebook", "Sent a message"], ["Tamara Sisterly Love Brown", "Facebook", "Sent a message"], ["Caitlin Wilson", "Facebook", "Sent a message"], ["Mason Kemp", "Facebook", "Sent a message"], ["Bradley Longo", "Facebook", "Sent a message"], ["Shakeyah Williams", "Facebook", "Sent a message"], ["Ann Yates", "Facebook", "Sent a message"], ["Sophia Giancola", "Facebook", "Sent a message"], ["Elsie Washburn", "Facebook", "Sent a message"], ["Deinara Sanches", "Facebook", "Sent a message"], ["Cait Sarah", "Facebook", "Sent a message"], ["Prasana Pandey", "Facebook", "Sent a message"], ["Tyler Boykin", "Facebook", "Sent a message", "Viewing scheduled June 15, 3:00-4:00 PM (Beth)"], ["Fernan Fernan", "Facebook", "Sent a message", "Interested in Redwood", "ps-unit-redwood-2b1b"], ["Chase Burkley", "Facebook", "Sent a message"], ["Sarah Warehime", "Facebook", "Sent a message"], ["Courtney Volpe", "Facebook", "Sent a message"], ["Libby Lutz", "Facebook", "Sent a message"], ["Sophie Wang", "Facebook", "Sent a message"], ["Ailyn Pv", "Facebook", "Sent a message"], ["Kylie Wang", "Facebook", "Sent a message"], ["Hafafizul 01", "Facebook", "Sent a message"], ["Mia Kuceba", "Facebook", "Sent a message"], ["Rayne Hawthorne", "Facebook", "Sent a message"], ["Hyosam Jeon", "Facebook", "Sent a message"], ["Vera Brown", "Facebook", "Sent a message"], ["Sabrina Mangone", "Facebook", "Sent a message"], ["Salma El", "Facebook", "Sent a message"], ["Hailey Avitabile", "Facebook", "Sent a message"], ["Samra Noori", "Facebook", "Sent a message", "Viewing completed via FaceTime (Beth)"], ["Anvesh Kiran Pidatala", "Facebook", "Sent a message"], ["Lexie Krivicich", "Facebook", "Sent a message"], ["Cade Velleman", "Facebook", "Sent a message"], ["Vivian Perez", "Facebook", "Sent a message"], ["Jayme Me'Leaha", "Facebook", "Sent a message"], ["Summer Ashto", "Facebook", "Sent a message"], ["Sterling Hirst", "Facebook", "Sent a message"], ["Déjanerra Mugford", "Facebook", "Sent a message", "Viewing completed"], ["Diana Hasty", "Facebook", "Sent a message"], ["Nyla Re", "Facebook", "Sent a message"], ["Chiara Marie", "Facebook", "Sent a message"], ["Yanna Allen", "Facebook", "Sent a message"], ["Mahinder Kaur", "Facebook", "Sent a message"], ["Shamyra Long", "Facebook", "Sent a message"], ["Kendrasol123@gmail.com", "Email", "Email sent"], ["Brandon Graddy", "Facebook", "Sent a message", "Interested in Anderson 1A (contacted Jun 15)", "ps-unit-anderson-1a"], ["Ty Sintrell", "Facebook", "Sent a message", "Interested in 37th 1A (contacted Jun 15)", "ps-unit-37th-1a"], ["James Jackson", "Facebook", "Sent a message", "Interested in Anderson 1A, looking to move in Sep 1 (contacted Jun 15)", "ps-unit-anderson-1a"], ["Heinitz Richard", "Facebook", "Sent a message", "Interested in Anderson 1A, looking to move in Sep 1 (contacted Jun 15)", "ps-unit-anderson-1a"], ["Emerson Brooks", "Facebook", "Sent a message", "Interested in 37th 2nd floor (contacted Jun 15)", "ps-unit-37th-2nd"], ["Kyle Burke", "Facebook", "Sent a message", "Interested in Sage (contacted Jun 15)", "ps-unit-sage"], ["Katy Gjovig", "Facebook", "Sent a message", "Interested in 37th 2D (contacted Jun 15)", "ps-unit-37th-2d"], ["Lydia Hough", "Facebook", "Sent a message (contacted Jun 16)"], ["Jeannie N Keith Pierce", "Facebook", "Sent a message (contacted Jun 16)"], ["James Degnan", "Facebook", "Sent a message (contacted Jun 16)"], ["Trevor Cheung", "Facebook", "Sent a message", "Viewing scheduled for 31st/Sage, expected move-in Aug 31, move-out Nov 30 (contacted Jun 16)", "ps-unit-sage"], ["Vickie Dixon", "Facebook", "Sent a message (contacted Jun 16)"], ["Christine Rufolo", "Facebook", "Sent a message (contacted Jun 20)"], ["Charlie Dobbertin", "Facebook", "Sent a message", "Interested in Golden Dusk (contacted Jun 20)", "ps-unit-golden-dusk"], ["Zenia Rangwala", "Facebook", "Sent a message (contacted Jun 20)"],
  ];

  for (let i = 0; i < leadDefs.length; i++) {
    const [name, channel, status, notes, interestedUnitId] = leadDefs[i];
    await prisma.lead.upsert({
      where: { id: `ps-lead-${i + 1}` },
      update: { name, channel, status, notes: notes ?? null, interestedUnitId: interestedUnitId ?? null },
      create: { id: `ps-lead-${i + 1}`, clientId: perfectStay.id, name, channel, status, notes: notes ?? null, interestedUnitId: interestedUnitId ?? null },
    });
  }

  const noticeDefs = [
    { id: "notice-welcome", content: "Welcome to the Notice board! Pin up reminders, tips, or anything the team should see.", color: "YELLOW", pinned: true },
    { id: "notice-wifi-password", content: "Guest WiFi password template is in the shared drive under Property Docs.", color: "BLUE", pinned: false },
    { id: "notice-checkin-reminder", content: "Double-check smart lock codes before every check-in — a few guests got locked out last week.", color: "PINK", pinned: false },
  ];

  for (const notice of noticeDefs) {
    await prisma.notice.upsert({
      where: { id: notice.id },
      update: { content: notice.content, color: notice.color as any, pinned: notice.pinned },
      create: {
        id: notice.id,
        content: notice.content,
        color: notice.color as any,
        pinned: notice.pinned,
        authorId: admin.id,
        teamId: team.id,
      },
    });
  }

  console.log("Seed complete.");
  console.log("Login with: admin@strassistance.com / charliehq123 (also lead@ / john@ / sarah@)");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
