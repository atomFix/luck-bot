#include <mach-o/dyld.h>
#include <limits.h>
#include <libgen.h>
#include <unistd.h>
#include <stdlib.h>
#include <stdio.h>
#include <stdint.h>
int main(int argc,char** argv){
 char raw[PATH_MAX],resolved[PATH_MAX],node[PATH_MAX],script[PATH_MAX];uint32_t size=sizeof(raw);
 if(_NSGetExecutablePath(raw,&size)!=0||!realpath(raw,resolved))return 1;
 char* folder=dirname(resolved);
 if(snprintf(node,sizeof(node),"%s/../Resources/node",folder)>=(int)sizeof(node)||snprintf(script,sizeof(script),"%s/../Resources/app/dist/src/integrations/cli.js",folder)>=(int)sizeof(script))return 1;
 char** args=calloc((size_t)argc+2,sizeof(char*));if(!args)return 1;
 args[0]=node;args[1]=script;for(int i=1;i<argc;i++)args[i+1]=argv[i];execv(node,args);free(args);return 1;
}
