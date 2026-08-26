For every requested change: edit and test locally, then immediately deploy to `root@mamaloty` via Tailscale.
After deployment, hard-reload Chromium on display `:0` using the Xorg `-auth` file, and visually verify the result on the Pi.
Do not wait for the user to request deployment or reload separately.
