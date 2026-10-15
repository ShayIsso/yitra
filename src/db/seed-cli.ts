import "dotenv/config";
import { seedDefaultCategories } from "./seed";

seedDefaultCategories()
  .then((r) => {
    console.log(
      `Seeded ${r.inserted} leaf categories (${r.alreadyExisted} already existed), ` +
        `${r.groupsInserted} groups, linked ${r.linked} leaves.`,
    );
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
