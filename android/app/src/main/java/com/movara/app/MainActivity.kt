package com.movara.app

import android.os.Bundle
import android.text.InputType
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.widget.AdapterView
import android.widget.ArrayAdapter
import android.widget.Button
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.Spinner
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import com.google.android.material.appbar.MaterialToolbar
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

class MainActivity : AppCompatActivity() {
    private lateinit var settings: MovaraSettings
    private lateinit var store: MovaraStore
    private lateinit var api: MovaraApiClient

    private lateinit var statusText: TextView
    private lateinit var modeSpinner: Spinner
    private lateinit var vehicleSpinner: Spinner
    private lateinit var typeCaption: TextView
    private lateinit var typeSpinner: Spinner
    private lateinit var subtypeCaption: TextView
    private lateinit var subtypeSpinner: Spinner
    private lateinit var titleInput: EditText
    private lateinit var dateInput: EditText
    private lateinit var odometerInput: EditText
    private lateinit var fuelQuantityCaption: TextView
    private lateinit var fuelQuantityInput: EditText
    private lateinit var amountCaption: TextView
    private lateinit var amountInput: EditText
    private lateinit var notesInput: EditText
    private lateinit var draftsText: TextView

    private var vehicles: List<Vehicle> = emptyList()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        settings = MovaraSettings(this)
        store = MovaraStore(this)
        api = MovaraApiClient(settings)

        buildUi()
        reloadLocalState()
    }

    override fun onCreateOptionsMenu(menu: Menu?): Boolean {
        menuInflater.inflate(R.menu.main, menu)
        return true
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        return when (item.itemId) {
            R.id.action_server_settings -> {
                showServerDialog()
                true
            }
            R.id.action_logout -> {
                settings.clearSession()
                reloadLocalState()
                toast("Logged out. Offline drafts stay on this phone.")
                true
            }
            else -> super.onOptionsItemSelected(item)
        }
    }

    private fun buildUi() {
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(0xfff8fafc.toInt())
        }

        val toolbar = MaterialToolbar(this).apply {
            title = getString(R.string.app_name)
            setTitleTextColor(0xffffffff.toInt())
            setBackgroundColor(0xff2563eb.toInt())
        }
        root.addView(toolbar, LinearLayout.LayoutParams.MATCH_PARENT, dp(56))

        val scroll = ScrollView(this)
        val content = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(16), dp(16), dp(16), dp(24))
        }
        scroll.addView(content)
        root.addView(
            scroll,
            LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 0, 1f)
        )
        setContentView(root)
        setSupportActionBar(toolbar)

        statusText = label("", textSize = 14f)
        content.addView(statusText)

        val topActions = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            setPadding(0, dp(12), 0, dp(12))
        }
        topActions.addView(actionButton("Server / login") { showServerDialog() }, rowButtonParams())
        topActions.addView(actionButton("Refresh") { refreshVehicles() }, rowButtonParams())
        topActions.addView(actionButton("Sync") { syncDrafts() }, rowButtonParams())
        content.addView(topActions)

        content.addView(section("Offline record"))
        modeSpinner = spinner(RECORD_MODES)
        modeSpinner.onItemSelectedListener = object : AdapterView.OnItemSelectedListener {
            override fun onItemSelected(parent: AdapterView<*>?, view: View?, position: Int, id: Long) {
                applyModeUi()
            }

            override fun onNothingSelected(parent: AdapterView<*>?) = Unit
        }
        content.addView(caption("Mode"))
        content.addView(modeSpinner)

        vehicleSpinner = spinner()
        content.addView(caption("Vehicle"))
        content.addView(vehicleSpinner)

        typeSpinner = spinner(RECORD_TYPES)
        typeCaption = caption("Type")
        content.addView(typeCaption)
        content.addView(typeSpinner)

        subtypeSpinner = spinner(RECORD_SUBTYPES)
        subtypeCaption = caption("Subtype")
        content.addView(subtypeCaption)
        content.addView(subtypeSpinner)

        titleInput = input("Title, e.g. Oil service")
        content.addView(caption("Title"))
        content.addView(titleInput)

        dateInput = input("YYYY-MM-DD").apply {
            setText(today())
            inputType = InputType.TYPE_CLASS_DATETIME
        }
        content.addView(caption("Date"))
        content.addView(dateInput)

        odometerInput = input("Odometer")
        odometerInput.inputType = InputType.TYPE_CLASS_NUMBER
        content.addView(caption("Odometer"))
        content.addView(odometerInput)

        fuelQuantityInput = input("Fuel quantity")
        fuelQuantityInput.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        fuelQuantityCaption = caption("Fuel quantity")
        content.addView(fuelQuantityCaption)
        content.addView(fuelQuantityInput)

        amountInput = input("Amount")
        amountInput.inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        amountCaption = caption("Amount")
        content.addView(amountCaption)
        content.addView(amountInput)

        notesInput = input("Notes").apply {
            minLines = 3
            gravity = android.view.Gravity.TOP
        }
        content.addView(caption("Notes"))
        content.addView(notesInput)

        content.addView(actionButton("Save offline") { saveDraft() })
        content.addView(actionButton("Delete pending draft") { showDeleteDraftDialog() })

        content.addView(section("Pending sync"))
        draftsText = label("", textSize = 14f)
        content.addView(draftsText)
        applyModeUi()
    }

    private fun reloadLocalState() {
        vehicles = store.vehicles()
        val vehicleLabels = if (vehicles.isEmpty()) {
            listOf("No cached vehicles yet")
        } else {
            vehicles.map { vehicle ->
                listOfNotNull(vehicle.name, vehicle.licensePlate).joinToString(" - ")
            }
        }
        vehicleSpinner.adapter = ArrayAdapter(
            this,
            android.R.layout.simple_spinner_dropdown_item,
            vehicleLabels
        )

        val server = settings.serverUrl ?: "No server configured. Use Server / login once, then offline records can queue here."
        val session = if (settings.token.isNullOrBlank()) "offline only" else "logged in"
        statusText.text = "$server\n$session - ${vehicles.size} cached vehicles - ${store.drafts().size} pending drafts"
        renderDrafts()
    }

    private fun applyModeUi() {
        val fuelMode = modeSpinner.selectedItemPosition == MODE_FUEL
        typeCaption.visibility = if (fuelMode) View.GONE else View.VISIBLE
        typeSpinner.visibility = if (fuelMode) View.GONE else View.VISIBLE
        subtypeCaption.visibility = if (fuelMode) View.GONE else View.VISIBLE
        subtypeSpinner.visibility = if (fuelMode) View.GONE else View.VISIBLE
        fuelQuantityCaption.visibility = if (fuelMode) View.VISIBLE else View.GONE
        fuelQuantityInput.visibility = if (fuelMode) View.VISIBLE else View.GONE
        titleInput.hint = if (fuelMode) "Fuel fill-up" else "Title, e.g. Oil service"
        amountCaption.text = if (fuelMode) "Fuel cost" else "Amount"
    }

    private fun showServerDialog() {
        val layout = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(20), dp(8), dp(20), 0)
        }
        val serverInput = input("https://movara.example.com").apply {
            setText(settings.serverUrl.orEmpty())
        }
        val emailInput = input("Email").apply {
            setText(settings.userEmail.orEmpty())
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        }
        val passwordInput = input("Password").apply {
            inputType = InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD
        }
        layout.addView(caption("Movara server"))
        layout.addView(serverInput)
        layout.addView(caption("Email"))
        layout.addView(emailInput)
        layout.addView(caption("Password"))
        layout.addView(passwordInput)

        AlertDialog.Builder(this)
            .setTitle("Server settings")
            .setMessage("Records work offline. Login is only needed to refresh vehicles and sync.")
            .setView(layout)
            .setNegativeButton("Save offline") { _, _ ->
                if (saveServerUrl(serverInput.text.toString())) {
                    reloadLocalState()
                }
            }
            .setPositiveButton("Login") { _, _ ->
                if (saveServerUrl(serverInput.text.toString())) {
                    settings.userEmail = emailInput.text.toString()
                    login(emailInput.text.toString(), passwordInput.text.toString())
                }
            }
            .show()
    }

    private fun saveServerUrl(rawUrl: String): Boolean {
        val url = rawUrl.trim().removeSuffix("/")
        if (url.isBlank()) {
            toast("Enter a server URL.")
            return false
        }
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
            toast("Server URL must start with http:// or https://.")
            return false
        }
        settings.serverUrl = url
        return true
    }

    private fun login(email: String, password: String) {
        if (email.isBlank() || password.isBlank()) {
            toast("Enter email and password.")
            return
        }
        runBackground(
            work = {
                val token = api.login(email, password)
                settings.token = token
                store.replaceVehicles(api.fetchVehicles())
            },
            done = {
                reloadLocalState()
                toast("Logged in and vehicles refreshed.")
            }
        )
    }

    private fun refreshVehicles() {
        runBackground(
            work = {
                val fresh = api.fetchVehicles()
                store.replaceVehicles(fresh)
            },
            done = {
                reloadLocalState()
                toast("Vehicles refreshed.")
            }
        )
    }

    private fun saveDraft() {
        val selectedVehicle = vehicles.getOrNull(vehicleSpinner.selectedItemPosition)
        if (selectedVehicle == null) {
            toast("Refresh vehicles once before adding records.")
            return
        }
        val title = titleInput.text.toString().trim()
        val fuelMode = modeSpinner.selectedItemPosition == MODE_FUEL
        if (!fuelMode && title.isBlank()) {
            toast("Enter a title.")
            return
        }
        val date = dateInput.text.toString().trim()
        if (!isValidDate(date)) {
            toast("Enter a valid date as YYYY-MM-DD.")
            return
        }
        val odometer = odometerInput.text.toString().toDoubleOrNull()
        val amount = amountInput.text.toString().toDoubleOrNull()
        val fuelQuantity = fuelQuantityInput.text.toString().toDoubleOrNull()
        if (fuelMode && (odometer == null || odometer < 0)) {
            toast("Fuel records need a valid odometer.")
            return
        }
        if (fuelMode && (fuelQuantity == null || fuelQuantity <= 0)) {
            toast("Fuel records need a fuel quantity.")
            return
        }
        if (amount != null && amount < 0) {
            toast("Amount cannot be negative.")
            return
        }
        store.addDraft(
            syncKind = if (fuelMode) "fuel" else "vehicle_record",
            vehicle = selectedVehicle,
            type = if (fuelMode) "expense" else RECORD_TYPES[typeSpinner.selectedItemPosition],
            subtype = if (fuelMode) "custom" else RECORD_SUBTYPES[subtypeSpinner.selectedItemPosition],
            title = if (fuelMode && title.isBlank()) "Fuel fill-up" else title,
            date = date,
            odometer = odometer,
            amount = amount,
            fuelQuantity = fuelQuantity,
            notes = notesInput.text.toString().trim().ifBlank { null }
        )
        titleInput.text.clear()
        odometerInput.text.clear()
        fuelQuantityInput.text.clear()
        amountInput.text.clear()
        notesInput.text.clear()
        reloadLocalState()
        toast("Saved offline.")
    }

    private fun syncDrafts() {
        runBackground(
            work = {
                val drafts = store.drafts().sortedBy { it.createdAt }
                var synced = 0
                var failed = 0
                drafts.forEach { draft ->
                    try {
                        api.createVehicleRecord(draft)
                        store.deleteDraft(draft.id)
                        synced += 1
                    } catch (error: Exception) {
                        store.markDraftError(draft.id, error.message ?: "Sync failed")
                        failed += 1
                    }
                }
                SyncResult(drafts.size, synced, failed)
            },
            done = { result ->
                reloadLocalState()
                toast("Sync: ${result.synced}/${result.attempted} sent, ${result.failed} failed.")
            }
        )
    }

    private fun renderDrafts() {
        val drafts = store.drafts()
        draftsText.text = if (drafts.isEmpty()) {
            "No pending records."
        } else {
            drafts.joinToString("\n\n") { draft ->
                val amount = draft.amount?.let { " - amount $it" }.orEmpty()
                val odometer = draft.odometer?.let { " - odo $it" }.orEmpty()
                val fuel = draft.fuelQuantity?.let { " - fuel $it" }.orEmpty()
                val error = draft.lastError?.let { "\nLast error: $it" }.orEmpty()
                "${draft.vehicleName}\n#${draft.id} ${draft.date} - ${draft.title}\n${draft.syncKind}: ${draft.type}/${draft.subtype}$odometer$fuel$amount$error"
            }
        }
    }

    private fun showDeleteDraftDialog() {
        val drafts = store.drafts()
        if (drafts.isEmpty()) {
            toast("No pending drafts to delete.")
            return
        }
        val labels = drafts.map { draft ->
            "#${draft.id} ${draft.vehicleName} - ${draft.title}"
        }.toTypedArray()
        AlertDialog.Builder(this)
            .setTitle("Delete pending draft")
            .setItems(labels) { _, which ->
                val draft = drafts[which]
                AlertDialog.Builder(this)
                    .setTitle("Delete draft #${draft.id}?")
                    .setMessage("${draft.vehicleName}\n${draft.date} - ${draft.title}")
                    .setNegativeButton("Cancel", null)
                    .setPositiveButton("Delete") { _, _ ->
                        store.deleteDraft(draft.id)
                        reloadLocalState()
                        toast("Draft deleted.")
                    }
                    .show()
            }
            .show()
    }

    private fun <T> runBackground(work: () -> T, done: (T) -> Unit) {
        Thread {
            try {
                val result = work()
                runOnUiThread { done(result) }
            } catch (error: Exception) {
                runOnUiThread {
                    reloadLocalState()
                    toast(error.message ?: "Something went wrong.")
                }
            }
        }.start()
    }

    private fun actionButton(text: String, onClick: () -> Unit): Button {
        return Button(this).apply {
            this.text = text
            minHeight = dp(44)
            setOnClickListener { onClick() }
        }
    }

    private fun input(hintText: String): EditText {
        return EditText(this).apply {
            hint = hintText
            setSingleLine(false)
            setPadding(dp(12), dp(8), dp(12), dp(8))
        }
    }

    private fun spinner(items: List<String> = emptyList()): Spinner {
        return Spinner(this).apply {
            if (items.isNotEmpty()) {
                adapter = ArrayAdapter(
                    this@MainActivity,
                    android.R.layout.simple_spinner_dropdown_item,
                    items
                )
            }
        }
    }

    private fun section(text: String): TextView {
        return label(text, textSize = 20f).apply {
            setPadding(0, dp(18), 0, dp(8))
            setTextColor(0xff0f172a.toInt())
        }
    }

    private fun caption(text: String): TextView {
        return label(text, textSize = 12f).apply {
            setPadding(0, dp(10), 0, 0)
            setTextColor(0xff475569.toInt())
        }
    }

    private fun label(text: String, textSize: Float): TextView {
        return TextView(this).apply {
            this.text = text
            this.textSize = textSize
            setTextColor(0xff334155.toInt())
        }
    }

    private fun rowButtonParams(): LinearLayout.LayoutParams {
        return LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply {
            marginEnd = dp(8)
        }
    }

    private fun dp(value: Int): Int {
        return (value * resources.displayMetrics.density).toInt()
    }

    private fun toast(message: String) {
        Toast.makeText(this, message, Toast.LENGTH_LONG).show()
    }

    private fun today(): String {
        return SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
    }

    private fun isValidDate(value: String): Boolean {
        return try {
            val format = SimpleDateFormat("yyyy-MM-dd", Locale.US)
            format.isLenient = false
            val parsed = format.parse(value)
            parsed != null && format.format(parsed) == value
        } catch (_: Exception) {
            false
        }
    }

    companion object {
        private const val MODE_RECORD = 0
        private const val MODE_FUEL = 1
        private val RECORD_MODES = listOf(
            "Vehicle record",
            "Fuel fill-up"
        )
        private val RECORD_TYPES = listOf(
            "maintenance",
            "document",
            "subscription",
            "expense",
            "accessory"
        )
        private val RECORD_SUBTYPES = listOf(
            "service",
            "repair",
            "inspection",
            "other",
            "insurance_third_party",
            "insurance_own_damage",
            "pollution_check",
            "registration",
            "sim_recharge",
            "tracker_purchase",
            "accessory_purchase",
            "permit",
            "warranty",
            "custom"
        )
    }
}
