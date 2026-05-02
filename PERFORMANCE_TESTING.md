# Performance Testing Guide

## Quick Start: Generate Test Data

### Option 1: Create 100 Test Entries (Using Expo Console)

**STEP-BY-STEP Instructions:**

1. Open Expo DevTools console (already visible in your screenshot)
2. Copy and paste this **entire block** into the console and press Enter:

```javascript
(async () => {
  const { generateTestData } = require("./src/utils/performanceTest");
  const { loadVault, saveVault } = require("./src/utils/storage");
  const { useSession } = require("./src/context/SessionContext");

  // Note: masterPassword is assumed from current context
  // If it fails, you may need to get it from the app state
  const masterPassword = "your-master-password-here"; // REPLACE THIS!

  console.log("[TEST] Starting test data generation...");

  // Step 1: Generate 100 test entries
  const testEntries = generateTestData(100);
  console.log(`[TEST] Generated ${testEntries.length} entries`);

  // Step 2: Load current vault
  const currentVault = await loadVault(masterPassword);
  console.log(`[TEST] Current vault has ${currentVault.length} entries`);

  // Step 3: Merge test entries with existing
  const merged = [...currentVault, ...testEntries];
  console.log(`[TEST] Total after merge: ${merged.length} entries`);

  // Step 4: Save merged vault
  // Note: saveVault expects an object with structure: { entries: [], createdAt, updatedAt, hash }
  // For now, just use import via backup file
  console.log(
    "[TEST] ⚠️ To save, use the Import feature in Settings with a backup containing test data",
  );
})();
```

**OR EASIER - Use 3-Step Manual Approach:**

Instead of saving via code, let's use the built-in import feature:

1. Create a test backup file with 100+ entries using the generate utility
2. Go to **Settings → Import Backup**
3. Select the test backup file
4. Choose **Merge & Deduplicate** mode
5. ✅ Vault now has 100+ entries!

### ✅ SIMPLEST APPROACH - Quick Manual Test

You already have 9 entries in your vault. Let's test with what you have first:

1. Go to **HomeScreen**
2. Scroll through entries - is it smooth? ✅/❌
3. Type in search box - any lag? ✅/❌
4. Add a few more entries manually - how long? ✅/❌
5. Export vault - how long? ✅/❌

**Results with 9-15 entries should be:**

- Load: < 200ms
- Search: Instant (no lag)
- Add/Edit: < 300ms
- Scroll: Smooth 60fps

If these are all fast with 9 entries, then performance is good! ✅

---

### If You Want Stress Testing (100+ entries)

**Option A: Export → Edit JSON → Import Back**

1. Go to **Settings → Export Backup**
2. Save the backup file
3. Edit it manually to duplicate entries 10x
4. Go to **Settings → Import Backup**
5. Select your edited file
6. Choose **Merge & Deduplicate**
7. Now vault has 90-100 entries!

**Option B: Add Entries Programmatically** (advanced)

Create a helper component temporarily in your app:

```typescript
// Add to HomeScreen temporarily for testing
const generateAndAddTestEntries = async () => {
  const { generateTestData } = require("./src/utils/performanceTest");
  const testEntries = generateTestData(100);

  // Import logic here to add to vault
  console.log("Generated 100 entries - ready for import");
  // Then use the import flow
};

// Call this when you want to trigger the test
```

---

## Testing Checklist

### ⚡ Performance Metrics to Track

**Load Time (HomeScreen)**

- [ ] Initial load: Should be < 500ms
- [ ] After 50 entries: < 800ms
- [ ] After 100 entries: < 1200ms
- [ ] After 500 entries: Note sluggishness

**Search Performance**

- [ ] Search with 100 entries: < 100ms to filter
- [ ] Typing in search: No stuttering
- [ ] Results update: Smooth animation

**Memory Usage**

- [ ] Monitor via React DevTools or console
- [ ] Check for memory leaks after operations
- [ ] Verify cleanup after navigation

**Operations**

- [ ] Add entry: < 300ms save
- [ ] Edit entry: < 300ms save
- [ ] Delete entry: < 200ms save
- [ ] Import 100 entries: < 2s total
- [ ] Export vault: < 2s total

---

## How to Monitor Performance

### In Expo DevTools

1. Open Expo app on your device
2. Shake device → open DevTools menu
3. Select "Performance Monitor"
4. Watch FPS and memory during operations

### In React DevTools (via Remote JS Debugging)

1. Open DevTools from Expo menu
2. Open React DevTools tab
3. Use Profiler to trace component renders
4. Look for unnecessary re-renders

### Manual Timing in Code

Already added to screens:

- `console.log("HomeScreen mounted")` - track mount times
- `console.log("Import started")` - track operation times
- Check logs in terminal

---

## Expected Baseline (Current App)

**With current implementation:**

- ✅ 10-20 entries: Very fast, no issues
- ✅ 50 entries: Still responsive
- ⚠️ 100+ entries: May see slight UI lag
- ⚠️ 500+ entries: Will need optimization

---

## Optimization Focus Areas (If Needed)

### 1. HomeScreen List Rendering

- [ ] FlatList optimization (virtualization)
- [ ] Memoization of list items
- [ ] Reduce re-renders on scroll

### 2. Search/Filter Performance

- [ ] Debounce search input (already 120ms)
- [ ] Memoize filter results
- [ ] Use useCallback for handlers

### 3. Vault Loading

- [ ] Lazy load categories
- [ ] Cache decrypted vault
- [ ] Pagination for large vaults

### 4. Memory Management

- [ ] Cleanup subscriptions
- [ ] Remove unused data from state
- [ ] Clear logs in production

---

## Test Results Template

```
Date: [TODAY]
Device: [YOUR DEVICE]
Entries Count: [NUMBER]

### Load Times
- HomeScreen load: ___ms
- Search initialization: ___ms
- Add entry save: ___ms

### Responsiveness
- Scroll smooth? YES/NO
- Search lag? YES/NO
- Operations responsive? YES/NO

### Issues Found
- [ ] None
- [ ] [Describe]

### Memory Usage
- Baseline: ___MB
- After operations: ___MB
- Issues? YES/NO
```

---

## Next Steps

1. **Generate test data** (100 entries)
2. **Run through checklist** above
3. **Note any sluggishness**
4. **Report findings** - I'll optimize!

Good luck! 🚀
