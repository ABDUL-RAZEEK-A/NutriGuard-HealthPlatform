async function verifyExpenseLogic() {
  const baseUrl = 'http://localhost:3000/api';
  
  const mockProfile = {
    name: 'Orion',
    age: 30,
    weight: 70,
    height: 175,
    bmi: 22.9,
    conditions: 'Hypertension',
    goals: 'Health'
  };

  console.log("🚀 Starting Expense Logic Verification...");

  // Test 1: User provides expense
  console.log("\n--- Test 1: User provides expense (₹500) ---");
  try {
    const res1 = await fetch(`${baseUrl}/analyze-meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: mockProfile,
        text: "A simple salad",
        expense: "500"
      })
    });
    const data1 = await res1.json();
    console.log(`Response Expense: ₹${data1.estimated_expense}`);
    if (data1.estimated_expense === 500) {
      console.log("✅ Success: User expense preserved.");
    } else {
      console.error("❌ Failure: User expense overwritten.");
    }
  } catch (err: any) {
    console.error("❌ Test 1 Error:", err.message);
  }

  // Test 2: User provides no expense (fallback to AI)
  console.log("\n--- Test 2: User provides no expense (Fallback to AI) ---");
  try {
    const res2 = await fetch(`${baseUrl}/analyze-meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: mockProfile,
        text: "A complex meal with chicken and rice",
        expense: ""
      })
    });
    const data2 = await res2.json();
    console.log(`AI Estimated Expense: ₹${data2.estimated_expense}`);
    if (data2.estimated_expense > 0) {
      console.log("✅ Success: AI estimate used as fallback.");
    } else {
      console.error("❌ Failure: No expense generated.");
    }
  } catch (err: any) {
    console.error("❌ Test 2 Error:", err.message);
  }

  // Test 3: Invalid expense (negative)
  console.log("\n--- Test 3: Invalid expense (-100) ---");
  try {
    const res3 = await fetch(`${baseUrl}/analyze-meal`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        profile: mockProfile,
        text: "Salad",
        expense: "-100"
      })
    });
    if (res3.status === 400) {
      const data3 = await res3.json();
      console.log(`✅ Success: Negative expense rejected with: ${data3.error}`);
    } else {
      console.error("❌ Failure: Negative expense accepted.");
    }
  } catch (err: any) {
    console.error("❌ Test 3 Error:", err.message);
  }
}

verifyExpenseLogic();
