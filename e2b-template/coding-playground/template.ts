// import { Template } from 'e2b'

// export const template = Template()
//   .fromImage('e2bdev/base')
//   .runCmd('echo Hello World E2B!')

// import { Template } from 'e2b'

// export const template = Template()
//   .fromImage('e2bdev/base:latest')
//   .runCmd('sudo apt-get update')
//   .runCmd(`
//     sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
//       nodejs \
//       npm \
//       python3 \
//       python3-pip \
//       build-essential \
//       git \
//       curl \
//       ca-certificates
//   `)
//   .runCmd('sudo rm -rf /var/lib/apt/lists/*')


import { Template } from 'e2b'

export const template = Template()
  .fromImage('e2bdev/base:latest')
  .runCmd('sudo apt-get update')
  .runCmd(`
    sudo DEBIAN_FRONTEND=noninteractive apt-get install -y \
      nodejs \
      npm \
      python3 \
      python3-pip \
      build-essential \
      git \
      curl \
      ca-certificates
  `)
  .runCmd('sudo rm -rf /var/lib/apt/lists/*')
