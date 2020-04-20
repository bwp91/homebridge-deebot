# Changelog

**IMPORTANT**
If you encounter any issue while installing, you might have to install additionnal packages on your environment since the main dependency of it depends on canvas library which is not available for all configurations. See there for more details : [canvas compiling](https://github.com/Automattic/node-canvas#compiling).

For use in the [oznu/homebridge](https://github.com/oznu/docker-homebridge) Docker image (Alpine Linux) please add the following line to your `startup.sh` script and restart the container. You can edit this file in directly in the Homebride UI by selecting the drop down menu in the upper-right-corner and selecting _Startup Script_.

```
apk add build-base cairo-dev jpeg-dev pango-dev giflib-dev librsvg-dev
```

You can also use the [PACKAGES](https://github.com/oznu/docker-homebridge#optional-settings) env variable directly with docker

```bash
-e PACKAGES=build-base,cairo-dev,jpeg-dev,pango-dev,giflib-dev,librsvg-dev
```

All notable changes to this project will be documented in this file.

## 0.0.6

**DirectionChange for mode still not working, speed might cause problems**

- [FIX] library change for better support
- [FIX] nick is not always there #7

## 0.0.5

- [FIX] some early fixes

## 0.0.4

- [FIX] fixing update of cleaning status

## 0.0.3

- [FIX] fixing platform name

## 0.0.2

- [NEW] adding config schema for Config UI-X

## 0.0.1

- [NEW] First Version
