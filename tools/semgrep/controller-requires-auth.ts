@Controller('things')
export class ThingsController {
  @Public()
  @Get('open')
  open() {
    return 1;
  }

  @Get('ready')
  @Public()
  ready() {
    return 1;
  }

  @Roles('admin')
  @Post()
  create() {
    return 1;
  }

  // ruleid: etkinlik-route-without-access-decision
  @Get('leak')
  leak() {
    return 1;
  }
}

@Controller('me')
@Roles('student', 'advisor', 'admin')
export class MeController {
  // ok: etkinlik-route-without-access-decision
  @Get()
  me() {
    return 1;
  }
}
