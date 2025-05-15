document.addEventListener("DOMContentLoaded", () => {
  // Set today's date as min for start date with IST timezone adjustment
  const today = new Date()
  // Adjust for IST timezone (UTC+5:30)
  const istOffset = 5.5 * 60 * 60 * 1000 // 5 hours and 30 minutes in milliseconds
  const todayIST = new Date(today.getTime() + istOffset)

  const startDateInput = document.getElementById("startDate")
  if (startDateInput) {
    // Format date as YYYY-MM-DD for input
    const formattedDate = todayIST.toISOString().split("T")[0]
    startDateInput.value = formattedDate
    startDateInput.min = formattedDate
  }

  // Set tomorrow as default end date
  const endDateInput = document.getElementById("endDate")
  if (endDateInput) {
    const tomorrow = new Date(todayIST)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const formattedTomorrow = tomorrow.toISOString().split("T")[0]
    endDateInput.min = formattedTomorrow
    endDateInput.value = formattedTomorrow
  }
})
