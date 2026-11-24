import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Admintickets } from './admintickets';

describe('Admintickets', () => {
  let component: Admintickets;
  let fixture: ComponentFixture<Admintickets>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Admintickets],
    }).compileComponents();

    fixture = TestBed.createComponent(Admintickets);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
