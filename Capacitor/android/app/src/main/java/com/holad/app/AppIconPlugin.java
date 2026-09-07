package com.holad.app;

import android.content.ComponentName;
import android.content.Context;
import android.content.pm.PackageManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppIcon")
public class AppIconPlugin extends Plugin {

    @PluginMethod
    public void setAppIcon(PluginCall call) {
        String icon = call.getString("icon");
        if (icon == null || icon.isEmpty()) {
            call.reject("Icon parameter must be provided");
            return;
        }

        try {
            Context context = getContext();
            PackageManager pm = context.getPackageManager();
            String pkg = context.getPackageName();

            ComponentName waveDark = new ComponentName(pkg, "com.holad.app.MainActivityWaveDark");
            ComponentName waveLight = new ComponentName(pkg, "com.holad.app.MainActivityWaveLight");
            ComponentName cassette = new ComponentName(pkg, "com.holad.app.MainActivityCassette");

            // Enable target first, then disable others
            if ("wave_light".equals(icon)) {
                pm.setComponentEnabledSetting(waveLight, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
                pm.setComponentEnabledSetting(waveDark, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
                pm.setComponentEnabledSetting(cassette, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            } else if ("cassette".equals(icon)) {
                pm.setComponentEnabledSetting(cassette, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
                pm.setComponentEnabledSetting(waveDark, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
                pm.setComponentEnabledSetting(waveLight, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            } else {
                pm.setComponentEnabledSetting(waveDark, PackageManager.COMPONENT_ENABLED_STATE_ENABLED, PackageManager.DONT_KILL_APP);
                pm.setComponentEnabledSetting(waveLight, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
                pm.setComponentEnabledSetting(cassette, PackageManager.COMPONENT_ENABLED_STATE_DISABLED, PackageManager.DONT_KILL_APP);
            }

            JSObject ret = new JSObject();
            ret.put("success", true);
            ret.put("icon", icon);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Failed to change app icon: " + e.getMessage(), e);
        }
    }
}
