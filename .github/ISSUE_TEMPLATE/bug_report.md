---
name: Bug report
about: Create a report to help us improve
title: "Bug:"
labels: 🐛 bug
assignees: ""
body:
  - type: input
    id: description
    attributes:
      label: Description
      description: What happened and what did you expect?
      placeholder: Selecting a numeric metric on Explore page throws an error "Undefined"
    validations:
      required: true
  - type: textarea
    id: reproduce
    attributes:
      label: To Reproduce
      description: Steps & screenshot/gif/loom to reproduce the behavior
      placeholder: >-
        1. Go to '...' 
        2. Click on '....'
        3. Scroll down to '....' 
        4. See error
    validations:
      required: false
  - type: input
    id: version
    attributes:
      label: version
      description: What version of Lightdash were you using when you encountered the
        bug? (App version is available in the footer of the Lightdash homepage)
      placeholder: v0.1045.0
    validations:
      required: false
  - type: dropdown
    id: cloud
    attributes:
      label: Cloud or self-hosting
      description: Did you get this bug on Lightdash cloud or self-hosting
      options:
        - cloud
        - self-hosting
    validations:
      required: false
